import type { CsvValidationError, ParcelSize } from '../types'

export interface ParsedCsvRow {
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string
  parcel_weight: number
  parcel_size: ParcelSize
  delivery_window_start: string | null
  delivery_window_end: string | null
  notes: string | null
}

const REQUIRED_HEADERS = [
  'customer_name',
  'customer_phone',
  'address',
  'parcel_weight',
  'parcel_size',
  'delivery_window_start',
  'delivery_window_end',
  'notes',
] as const

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseOptional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function parseIsoDate(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function validateCsvRow(
  raw: Record<string, string>,
  rowNumber: number,
): { value?: ParsedCsvRow; errors: CsvValidationError[] } {
  const errors: CsvValidationError[] = []

  const customerName = raw.customer_name?.trim()
  const address = raw.address?.trim()
  const parcelWeight = Number(raw.parcel_weight)
  const parcelSize = raw.parcel_size?.trim() as ParcelSize | undefined
  const deliveryWindowStart = parseIsoDate(raw.delivery_window_start)
  const deliveryWindowEnd = parseIsoDate(raw.delivery_window_end)

  if (!customerName) {
    errors.push({ row: rowNumber, field: 'customer_name', reason: 'Required' })
  }

  if (!address) {
    errors.push({ row: rowNumber, field: 'address', reason: 'Required' })
  }

  if (!Number.isFinite(parcelWeight) || parcelWeight <= 0) {
    errors.push({ row: rowNumber, field: 'parcel_weight', reason: 'Must be > 0' })
  }

  if (!parcelSize || !['small', 'medium', 'large'].includes(parcelSize)) {
    errors.push({ row: rowNumber, field: 'parcel_size', reason: 'Must be small, medium, or large' })
  }

  if (raw.delivery_window_start?.trim() && !deliveryWindowStart) {
    errors.push({ row: rowNumber, field: 'delivery_window_start', reason: 'Invalid ISO date' })
  }

  if (raw.delivery_window_end?.trim() && !deliveryWindowEnd) {
    errors.push({ row: rowNumber, field: 'delivery_window_end', reason: 'Invalid ISO date' })
  }

  if (deliveryWindowStart && deliveryWindowEnd) {
    if (new Date(deliveryWindowEnd).getTime() <= new Date(deliveryWindowStart).getTime()) {
      errors.push({ row: rowNumber, field: 'delivery_window_end', reason: 'Must be after start' })
    }
  }

  if (errors.length > 0) return { errors }

  return {
    value: {
      customer_name: customerName!,
      customer_phone: parseOptional(raw.customer_phone),
      customer_email: parseOptional(raw.customer_email),
      address: address!,
      parcel_weight: parcelWeight,
      parcel_size: parcelSize!,
      delivery_window_start: deliveryWindowStart,
      delivery_window_end: deliveryWindowEnd,
      notes: parseOptional(raw.notes),
    },
    errors,
  }
}

export function parseBulkCsv(
  input: string,
): { rows: ParsedCsvRow[]; errors: CsvValidationError[] } {
  const lines = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return {
      rows: [],
      errors: [{ row: 1, field: 'file', reason: 'CSV is empty' }],
    }
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: missingHeaders.map((header) => ({
        row: 1,
        field: header,
        reason: 'Missing required column',
      })),
    }
  }

  const rows: ParsedCsvRow[] = []
  const errors: CsvValidationError[] = []

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i])
    const raw = Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? '']))
    const parsed = validateCsvRow(raw, i + 1)

    if (parsed.value) rows.push(parsed.value)
    errors.push(...parsed.errors)
  }

  return { rows, errors }
}
