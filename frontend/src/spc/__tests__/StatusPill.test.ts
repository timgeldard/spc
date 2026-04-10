import { describe, expect, it } from 'vitest'
import { deriveStatus, grrStatusClass } from '../components/StatusPill'

describe('deriveStatus', () => {
  it('returns in-control when no violations and Cpk meets threshold', () => {
    expect(deriveStatus(false, 1.33)).toBe('in-control')
    expect(deriveStatus(false, 1.0)).toBe('in-control')
  })

  it('returns warning when no violations but Cpk below threshold', () => {
    expect(deriveStatus(false, 0.99)).toBe('warning')
    expect(deriveStatus(false, 0.5)).toBe('warning')
  })

  it('returns out-of-control when violations present and Cpk meets threshold', () => {
    expect(deriveStatus(true, 1.33)).toBe('out-of-control')
  })

  it('returns out-of-control-high when violations AND Cpk below threshold', () => {
    expect(deriveStatus(true, 0.8)).toBe('out-of-control-high')
  })

  it('returns unknown when no violations and Cpk is null', () => {
    expect(deriveStatus(false, null)).toBe('unknown')
    expect(deriveStatus(false, undefined)).toBe('unknown')
  })

  it('returns out-of-control when violations and Cpk is null', () => {
    expect(deriveStatus(true, null)).toBe('out-of-control')
  })

  it('respects custom cpkThreshold', () => {
    // With threshold 1.33, a Cpk of 1.1 is not capable
    expect(deriveStatus(false, 1.1, 1.33)).toBe('warning')
    // With threshold 0.5, a Cpk of 0.6 is capable
    expect(deriveStatus(false, 0.6, 0.5)).toBe('in-control')
  })
})

describe('grrStatusClass', () => {
  it('returns unknown for null/undefined', () => {
    expect(grrStatusClass(null).verdict).toBe('Unknown')
    expect(grrStatusClass(undefined).verdict).toBe('Unknown')
    expect(grrStatusClass(null).colorStyle).toContain('secondary')
  })

  it('returns Acceptable for GRR < 10%', () => {
    const result = grrStatusClass(5)
    expect(result.verdict).toBe('Acceptable')
    expect(result.colorStyle).toContain('success')
  })

  it('returns Conditionally Acceptable for 10 ≤ GRR < 30%', () => {
    const result10 = grrStatusClass(10)
    expect(result10.verdict).toBe('Conditionally Acceptable')
    expect(result10.colorStyle).toContain('warning')

    const result29 = grrStatusClass(29.9)
    expect(result29.verdict).toBe('Conditionally Acceptable')
  })

  it('returns Not Acceptable for GRR ≥ 30%', () => {
    const result = grrStatusClass(30)
    expect(result.verdict).toBe('Not Acceptable')
    expect(result.colorStyle).toContain('error')

    expect(grrStatusClass(100).verdict).toBe('Not Acceptable')
  })
})
