"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scenarios = [
    {
        id: 'plain-answer',
        messages: [{ text: 'Reply with exactly: hello', expectedTools: [] }],
    },
    {
        id: 'calendar-today',
        messages: [{ text: 'What is on my calendar today?', expectedTools: ['list_calendar_events'] }],
    },
    {
        id: 'calendar-polish-timezone',
        messages: [
            {
                text: 'Czy mam cos w kalendarzu jutro? Podaj godziny lokalnie.',
                expectedTools: ['list_calendar_events'],
            },
        ],
    },
    {
        id: 'calendar-follow-up',
        messages: [
            { text: 'What is on my calendar today?', expectedTools: ['list_calendar_events'] },
            { text: 'What about tomorrow?', expectedTools: ['list_calendar_events'] },
        ],
    },
    {
        id: 'calendar-mutation-proposal',
        messages: [
            {
                text: 'Schedule a 30-minute appointment named "Evaluation only" tomorrow at 10:00. Do not execute it; show me the confirmation proposal.',
                expectedTools: ['propose_create_calendar_event'],
            },
        ],
    },
    {
        id: 'ambiguous-mutation',
        messages: [{ text: 'Add a meeting with Ola tomorrow.', expectedTools: [] }],
    },
];
function requiredEnv(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing required env var: ${name}`);
    return value;
}
function parsePositiveInt(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
}
function parseFrames(body) {
    const frames = body
        .split('\n\n')
        .filter((frame) => frame.startsWith('data: '))
        .map((frame) => JSON.parse(frame.slice('data: '.length)));
    const completion = frames.find((frame) => frame.done);
    if (!completion)
        throw new Error('Chat response did not include a completion frame');
    return {
        text: frames.flatMap((frame) => (frame.delta === undefined ? [] : [frame.delta])).join(''),
        completion,
    };
}
const apiUrl = process.env.EVAL_API_URL ?? 'http://localhost:3000';
const token = requiredEnv('EVAL_AUTH_TOKEN');
const model = requiredEnv('LLM_MODEL');
const runs = parsePositiveInt('EVAL_RUNS', 3);
const resetHistory = process.env.EVAL_RESET_HISTORY === 'true';
const results = [];
for (const scenario of scenarios) {
    for (let run = 1; run <= runs; run++) {
        if (resetHistory) {
            const response = await fetch(new URL('/chat/history', apiUrl), {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                throw new Error(`${scenario.id} run ${run}: history reset returned HTTP ${response.status}`);
            }
        }
        for (const [index, step] of scenario.messages.entries()) {
            const startedAt = new Date().toISOString();
            const started = performance.now();
            const response = await fetch(new URL('/chat', apiUrl), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: step.text }),
            });
            const elapsedMs = performance.now() - started;
            if (!response.ok) {
                throw new Error(`${scenario.id} run ${run}: chat returned HTTP ${response.status}`);
            }
            const { text, completion } = parseFrames(await response.text());
            const toolCalls = completion.toolCalls ?? [];
            results.push({
                scenario: scenario.id,
                step: index + 1,
                message: step.text,
                startedAt,
                model,
                expectedTools: step.expectedTools,
                toolCalls,
                toolMatch: JSON.stringify(toolCalls) === JSON.stringify(step.expectedTools),
                elapsedMs,
                text,
                metrics: completion.metrics,
            });
        }
    }
}
console.log(JSON.stringify({
    apiUrl,
    model,
    runs,
    resetHistory,
    results,
}, null, 2));
//# sourceMappingURL=evaluate-chat.js.map