import { describe, expect, it } from 'vitest'

import { detectNelsonRules, detectWECORules } from '../calculations.js'

const makeLimits = (cl, sigma) => ({
  cl,
  ucl: cl + 3 * sigma,
  lcl: cl - 3 * sigma,
  sigma1: sigma,
  sigma2: 2 * sigma,
})

describe('rule boundaries', () => {
  it('does not treat points exactly on the centre line as a same-side run', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10]
    expect(detectWECORules(values, makeLimits(10, 1)).filter(s => s.rule === 4)).toEqual([])
    expect(detectNelsonRules(values, makeLimits(10, 1)).filter(s => s.rule === 2)).toEqual([])
  })

  it('does not count points exactly on the 2σ boundary for WECO/Nelson zone-A rules', () => {
    const values = [12, 12, 10, 10, 10]
    expect(detectWECORules(values, makeLimits(10, 1)).filter(s => s.rule === 2)).toEqual([])
    expect(detectNelsonRules(values, makeLimits(10, 1)).filter(s => s.rule === 5)).toEqual([])
  })

  it('requires both sides of the centre line for Nelson rule 8 mixture detection', () => {
    const values = [12, 12.2, 12.1, 12.3, 12.4, 12.2, 12.1, 12.3]
    expect(detectNelsonRules(values, makeLimits(10, 1)).filter(s => s.rule === 8)).toEqual([])
  })
})
