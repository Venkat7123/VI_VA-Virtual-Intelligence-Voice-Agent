/**
 * The OpenAPI document Lyzr reads to build its custom tool.
 *
 * OpenAPI **3.0.3**, not 3.1, on purpose: 3.1 support across tool-importing
 * platforms is patchy, and this file only has to describe one POST.
 *
 * The `description` fields are not documentation — they are prompt. They are
 * what the voice agent reads to decide when to call the tool and what to do
 * with the answer, so they are written at the model, not at a developer.
 *
 * [unverified] The exact shape Lyzr wants for a custom tool import has not been
 * confirmed in Studio yet — see `context/open-questions.md`. This is a standard
 * spec and the obvious starting point; adjust once the importer has been seen.
 */
export function buildOpenApiDocument(publicUrl: string): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'VI-VA — Vision',
      version: '1.0.0',
      description:
        'Passes one spoken user turn to EDITH, the booking agent, and returns ' +
        'the sentence to say back.',
    },
    servers: [{ url: publicUrl }],
    paths: {
      '/tools/ask_edith': {
        post: {
          operationId: 'ask_edith',
          summary: 'Ask EDITH about a hospital appointment',
          description: [
            'Call this for EVERY user turn about booking, checking, moving or',
            'cancelling a hospital appointment — including short replies like',
            '"OMR", "tomorrow evening" or "yes".',
            '',
            'Speak the `say` field back to the user VERBATIM. Do not rephrase it,',
            'do not add to it, and never state a hospital, doctor, time or',
            'booking reference that did not come from this tool: EDITH is the',
            'only source of availability.',
            '',
            'Pass back the `session_id` you were given on every later call in the',
            'same conversation, so EDITH remembers what has been collected.',
          ].join('\n'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_said'],
                  properties: {
                    user_said: {
                      type: 'string',
                      description: 'Exactly what the user just said, verbatim.',
                    },
                    session_id: {
                      type: 'string',
                      description:
                        'Omit on the first call. After that, send back the ' +
                        'session_id returned by the previous call.',
                    },
                    intent: {
                      type: 'string',
                      enum: ['book', 'lookup', 'reschedule', 'cancel', 'escalate'],
                      description: 'Your best guess. Omit if unsure.',
                    },
                    details: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                      description:
                        'Anything specific you heard, e.g. {"chain":"Apollo",' +
                        '"area":"OMR"}. Omit what you did not hear; never guess.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'EDITH answered.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['session_id', 'status', 'say'],
                    properties: {
                      say: {
                        type: 'string',
                        description: 'Say this to the user, word for word.',
                      },
                      session_id: {
                        type: 'string',
                        description: 'Send this back on the next call.',
                      },
                      status: {
                        type: 'string',
                        enum: [
                          'needs_info',
                          'needs_choice',
                          'needs_confirm',
                          'booked',
                          'unavailable',
                          'escalated',
                        ],
                      },
                      options: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Choices to offer, when status is needs_choice.',
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Malformed request.' },
          },
        },
      },
    },
  };
}
