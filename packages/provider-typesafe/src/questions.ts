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
   * Normalizes raw TypeSafe System One response answers into typed TypedAnswer objects.
   */
  public static normalizeAnswers(rawAnswers: Record<string, any>): Record<string, TypedAnswer> {
    const normalized: Record<string, TypedAnswer> = {};

    for (const [key, raw] of Object.entries(rawAnswers)) {
      if (raw.choice !== undefined) {
        // Choice answer
        const probs: Record<string, number> = raw.probabilities || { [raw.choice]: raw.confidence ?? 1.0 };
        const probValues = Object.values(probs).sort((a, b) => b - a);
        const margin = probValues.length >= 2 ? probValues[0] - probValues[1] : undefined;
        let runnerUp: string | undefined;
        if (probValues.length >= 2) {
          runnerUp = Object.entries(probs).find(([k, v]) => k !== raw.choice && v === probValues[1])?.[0];
        }

        normalized[key] = {
          choice: String(raw.choice),
          confidence: Number(raw.confidence ?? 0.5),
          probabilities: probs,
          margin,
          runnerUp
        };
      } else if (raw.score !== undefined) {
        // Score answer
        const probs: number[] = Array.isArray(raw.probabilities) ? raw.probabilities : [];
        normalized[key] = {
          score: Number(raw.score),
          confidence: Number(raw.confidence ?? 0.5),
          probabilities: probs
        };
      } else if (raw.noul !== undefined) {
        // Noul answer (probability of yes)
        const pYes = Number(raw.noul);
        // Confidence for Noul is distance from 0.5 (maximum uncertainty) scaled to [0, 1]
        const confidence = Math.round(Math.abs(pYes - 0.5) * 2 * 100) / 100;
        normalized[key] = {
          noul: pYes,
          answer: pYes >= 0.5,
          confidence
        };
      }
    }

    return normalized;
  }
}
