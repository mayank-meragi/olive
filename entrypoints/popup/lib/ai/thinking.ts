import type { GenerateOptions } from './types'

export const resolveThinkingConfig = (
  opts: GenerateOptions,
): { thinkingBudget: number; includeThoughts: boolean } | undefined => {
  const budgetProvided =
    typeof opts.thinkingBudget === 'number' ? opts.thinkingBudget : undefined

  const wantsThoughts =
    opts.thinkingEnabled ??
    (typeof budgetProvided === 'number' && budgetProvided !== 0)

  if (!wantsThoughts) {
    if (typeof budgetProvided === 'number') {
      return {
        thinkingBudget: budgetProvided,
        includeThoughts: budgetProvided !== 0,
      }
    }
    return { thinkingBudget: 0, includeThoughts: false }
  }

  const budget = typeof budgetProvided === 'number' ? budgetProvided : -1

  return {
    thinkingBudget: budget,
    includeThoughts: true,
  }
}
