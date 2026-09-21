/**
 * Validated preset definitions for common AI coding agent operations.
 */
export const PRESET_REGISTRY = {
    relevance: {
        name: 'relevance',
        description: 'Determine semantic relevance of state/file against a target query or requirement',
        buildQuestions: (params) => {
            const query = params?.query || 'the stated requirement';
            return {
                is_relevant: {
                    type: 'noul',
                    instructions: `Does the provided content directly relate to or address: "${query}"?`
                },
                relevance_degree: {
                    type: 'score',
                    instructions: `How strongly does the content relate to "${query}"?`,
                    criteria: [
                        'Irrelevant: No relationship to the query',
                        'Tangential: Mentions related topics but does not address query',
                        'Partially Relevant: Addresses some aspects of the query',
                        'Highly Relevant: Directly and substantially addresses the query'
                    ]
                }
            };
        },
        synthesizeDecision: (answers) => {
            const isRel = answers.is_relevant?.noul > 0.5;
            const score = answers.relevance_degree?.score ?? 0;
            return {
                decision: isRel && score >= 2,
                reasonCode: isRel && score >= 2 ? 'RELEVANT_MATCH' : 'NOT_RELEVANT'
            };
        }
    },
    rank: {
        name: 'rank',
        description: 'Rank priority or match quality on a standard 0-4 score scale',
        buildQuestions: (params) => {
            const target = params?.target || 'priority';
            return {
                priority_rank: {
                    type: 'score',
                    instructions: `Score the priority or alignment regarding: "${target}"`,
                    criteria: [
                        'Level 0: Very low / negligible priority',
                        'Level 1: Low priority / minor consideration',
                        'Level 2: Moderate priority / normal task',
                        'Level 3: High priority / urgent requirement',
                        'Level 4: Critical / blocking priority'
                    ]
                }
            };
        },
        synthesizeDecision: (answers) => ({
            decision: answers.priority_rank?.score ?? 0,
            reasonCode: 'RANKED_SCORE_ASSIGNED'
        })
    },
    classify: {
        name: 'classify',
        description: 'Multi-class category classification with probability distributions',
        buildQuestions: (params) => {
            const categories = params?.categories || {
                feature: 'New feature or capability',
                bugfix: 'Defect or bug fix',
                refactor: 'Code cleanup or architectural refactoring',
                docs: 'Documentation, comments, or examples',
                test: 'Unit, integration, or e2e tests'
            };
            return {
                category: {
                    type: 'choice',
                    instructions: 'Classify the primary category of the provided content or change.',
                    criteria: categories
                }
            };
        },
        synthesizeDecision: (answers) => ({
            decision: answers.category?.choice ?? 'unknown',
            reasonCode: 'CLASSIFICATION_COMPLETE'
        })
    },
    verify_claim: {
        name: 'verify_claim',
        description: 'Verify if a factual claim or requirement is satisfied by the provided evidence',
        buildQuestions: (params) => {
            const claim = params?.claim || 'the claim holds true';
            return {
                is_verified: {
                    type: 'noul',
                    instructions: `Based solely on the provided evidence, is this claim true and verified: "${claim}"?`
                },
                evidence_sufficiency: {
                    type: 'choice',
                    instructions: 'Is the provided evidence sufficient to verify or falsify the claim?',
                    criteria: {
                        sufficient: 'Evidence is conclusive and complete',
                        inconclusive: 'Evidence is partial or ambiguous',
                        contradicted: 'Evidence actively contradicts the claim'
                    }
                }
            };
        },
        synthesizeDecision: (answers) => {
            const verified = answers.is_verified?.noul > 0.75;
            const sufficiency = answers.evidence_sufficiency?.choice;
            if (sufficiency === 'sufficient' && verified) {
                return { decision: true, reasonCode: 'CLAIM_VERIFIED' };
            }
            if (sufficiency === 'contradicted') {
                return { decision: false, reasonCode: 'CLAIM_CONTRADICTED' };
            }
            return { decision: false, reasonCode: 'EVIDENCE_INCONCLUSIVE' };
        }
    },
    extract_fields: {
        name: 'extract_fields',
        description: 'Structured field presence and extraction triage',
        buildQuestions: (params) => {
            const fields = params?.fields || ['has_breaking_changes', 'has_security_implications'];
            const questions = {};
            for (const f of fields) {
                questions[f] = {
                    type: 'noul',
                    instructions: `Does the provided state contain or indicate: ${f.replace(/_/g, ' ')}?`
                };
            }
            return questions;
        }
    },
    compare: {
        name: 'compare',
        description: 'Compare two alternatives A and B on alignment or correctness',
        buildQuestions: (params) => {
            const criterion = params?.criterion || 'correctness and quality';
            return {
                better_option: {
                    type: 'choice',
                    instructions: `Which option is superior according to: "${criterion}"?`,
                    criteria: {
                        option_a: 'Option A is distinctly superior',
                        option_b: 'Option B is distinctly superior',
                        equivalent: 'Both options are virtually equivalent',
                        neither: 'Neither option is acceptable'
                    }
                }
            };
        },
        synthesizeDecision: (answers) => ({
            decision: answers.better_option?.choice ?? 'equivalent',
            reasonCode: 'COMPARISON_DETERMINED'
        })
    },
    severity: {
        name: 'severity',
        description: 'Assess defect or incident severity level',
        buildQuestions: () => ({
            severity_level: {
                type: 'choice',
                instructions: 'Evaluate the operational and user impact severity of this issue.',
                criteria: {
                    sev1_critical: 'System outage, data loss, security breach, or blocked core workflow',
                    sev2_major: 'Major feature impaired with no reasonable workaround',
                    sev3_minor: 'Moderate defect with available workaround or edge-case behavior',
                    sev4_cosmetic: 'Minor UI/UX glitch, typo, or aesthetic inconsistency'
                }
            }
        }),
        synthesizeDecision: (answers) => ({
            decision: answers.severity_level?.choice ?? 'sev3_minor',
            reasonCode: 'SEVERITY_CLASSIFIED'
        })
    },
    ambiguity: {
        name: 'ambiguity',
        description: 'Detect whether instructions or requirements are ambiguous or contradictory',
        buildQuestions: () => ({
            is_ambiguous: {
                type: 'noul',
                instructions: 'Are the requirements, instructions, or goals materially ambiguous or missing vital parameters?'
            },
            ambiguity_type: {
                type: 'choice',
                instructions: 'If ambiguous, what is the primary source of ambiguity?',
                criteria: {
                    none: 'Requirements are crisp and actionable',
                    missing_context: 'Key inputs, types, or paths are unstated',
                    contradictory: 'Two or more requirements contradict each other',
                    underspecified: 'Multiple mutually incompatible valid solutions exist'
                }
            }
        }),
        synthesizeDecision: (answers) => {
            const isAmb = answers.is_ambiguous?.noul > 0.5;
            return {
                decision: isAmb,
                reasonCode: isAmb ? 'AMBIGUITY_DETECTED' : 'SPECIFICATION_CLEAR'
            };
        }
    },
    intent: {
        name: 'intent',
        description: 'Detect user intent for workflow routing',
        buildQuestions: () => ({
            user_intent: {
                type: 'choice',
                instructions: 'Determine the primary developer intent of the message.',
                criteria: {
                    run_command: 'Execute a test, build, lint, or shell command',
                    edit_code: 'Modify source files, refactor, or fix a bug',
                    ask_question: 'Explain code, architecture, or conceptual behavior',
                    browser_inspect: 'Test, verify, or debug a web UI or live web page',
                    review_audit: 'Review code changes, security audit, or blast-radius check'
                }
            }
        }),
        synthesizeDecision: (answers) => ({
            decision: answers.user_intent?.choice ?? 'ask_question',
            reasonCode: 'INTENT_IDENTIFIED'
        })
    },
    risk: {
        name: 'risk',
        description: 'Quantify operational risk of a planned action or script',
        buildQuestions: () => ({
            risk_rating: {
                type: 'choice',
                instructions: 'Assess the risk of executing this proposed change or command.',
                criteria: {
                    safe: 'Read-only, localized test, or purely additive change',
                    medium: 'Modifies multiple files or dependencies, but easily reverted',
                    high: 'Modifies shared database schema, migration, or critical auth logic',
                    destructive: 'Drops data, force-pushes, kills running production infrastructure'
                }
            },
            is_irreversible: {
                type: 'noul',
                instructions: 'Does this action cause irreversible or permanent data/state loss?'
            }
        }),
        synthesizeDecision: (answers) => {
            const isIrrev = answers.is_irreversible?.noul > 0.5;
            const rating = answers.risk_rating?.choice;
            const highRisk = isIrrev || rating === 'destructive' || rating === 'high';
            return {
                decision: highRisk ? 'HIGH_RISK' : 'ACCEPTABLE_RISK',
                reasonCode: highRisk ? 'RISK_GATE_ALERT' : 'RISK_GATE_CLEAR'
            };
        }
    },
    ship_gate: {
        name: 'ship_gate',
        description: 'Evaluate whether a branch or pull request is ready to ship',
        buildQuestions: () => ({
            ship_verdict: {
                type: 'choice',
                instructions: 'Based on test results, diff, and verification evidence, is this change ready to merge/ship?',
                criteria: {
                    READY_TO_SHIP: 'All checks pass, tests verify behavior, no blockers or regressions',
                    NEEDS_REVIEW: 'Plausible change, but requires human review or additional manual testing',
                    BLOCKED: 'Failing tests, build breaks, security risks, or unhandled errors present'
                }
            },
            confidence_score: {
                type: 'score',
                instructions: 'Rate certainty in the verification evidence.',
                criteria: [
                    'Uncertain: Incomplete logs or ambiguous results',
                    'Moderate: Basic checks pass but edge cases untested',
                    'High: Rigorous unit, integration, and contract tests verified'
                ]
            }
        }),
        synthesizeDecision: (answers) => {
            const verdict = answers.ship_verdict?.choice;
            return {
                decision: verdict === 'READY_TO_SHIP' ? 'READY_TO_SHIP' : 'BLOCKED',
                reasonCode: verdict === 'READY_TO_SHIP' ? 'SHIP_GATE_PASSED' : 'SHIP_GATE_HALTED'
            };
        }
    }
};
//# sourceMappingURL=presets.js.map