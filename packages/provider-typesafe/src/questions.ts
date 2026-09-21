/**
 * Question translation and validation for TypeSafe System One API.
 */

import { QuestionDef, TypedAnswer } from '@agentctl/core';

export class TypeSafeQuestionBuilder {
  /**
   * Formats internal QuestionDef map into TypeSafe System One request shape.
   */
  public static buildPayloadQuestions(questions: Record<string, QuestionDef>): Record<string, any> {
    const payloadQuestions: Record<string, any> = {};

    for (const [key, q] of Object.entries(questions)) {
      if (q.type === 'choice') {
        payloadQuestions[key] = {
          type: 'choice',
          instructions: q.instructions,
          criteria: q.criteria
        };
      } else if (q.type === 'score') {
        payloadQuestions[key] = {
          type: 'score',
          instructions: q.instructions,
          criteria: q.criteria
        };
      } else if (q.type === 'noul') {
        payloadQuestions[key] = {
          type: 'noul',
          instructions: q.instructions
        };
      }
    }

    return payloadQuestions;
  }

  /**
   * Normalizes raw TypeSafe System One answers into TypedAnswer objects.
   * All three answer types share one confidence scale: the probability of the reported answer.
   */
  public static normalizeAnswers(rawAnswers: Record<string, any>): Record<string, TypedAnswer> {
    const normalized: Record<string, TypedAnswer> = {};

    for (const [key, raw] of Object.entries(rawAnswers)) {
      const type = raw.type ?? (raw.choice !== undefined ? 'choice' : raw.score !== undefined ? 'score' : 'noul');

      if (type === 'choice') {
        const probs: Record<string, number> = raw.probabilities || { [raw.choice]: raw.confidence ?? 1.0 };
        const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1]);
        const runnerUp = ranked.find(([k]) => k !== String(raw.choice));
        normalized[key] = {
          choice: String(raw.choice),
          confidence: Number(raw.confidence ?? probs[raw.choice] ?? 0.5),
          probabilities: probs,
          margin: runnerUp ? round((probs[raw.choice] ?? ranked[0][1]) - runnerUp[1]) : undefined,
          runnerUp: runnerUp?.[0]
        };
      } else if (type === 'score') {
        normalized[key] = {
          score: Number(raw.score),
          confidence: Number(raw.confidence ?? 0.5),
          probabilities: toLevelArray(raw.probabilities)
        };
      } else {
        const pYes = Number(raw.noul);
        normalized[key] = {
          noul: pYes,
          answer: pYes >= 0.5,
          confidence: round(Math.max(pYes, 1 - pYes))
        };
      }
    }

    return normalized;
  }
}

/** The API returns score distributions as {"0": p0, "1": p1, ...}; expose them as [p0, p1, ...]. */
function toLevelArray(probabilities: unknown): number[] {
  if (Array.isArray(probabilities)) return probabilities.map(Number);
  if (probabilities && typeof probabilities === 'object') {
    return Object.entries(probabilities as Record<string, number>)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, p]) => Number(p));
  }
  return [];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
