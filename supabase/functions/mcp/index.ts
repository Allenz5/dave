// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'

// The MCP server a user's agent connects to. The agent signs in through Supabase Auth's OAuth server,
// and every tool queries as that user, so RLS limits it to the user's own channels.
Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (req, { supabase, userClaims }) => {
      // A fresh server per request: Edge Functions are stateless
      const handler = createMcpHandler(
        () => {
          const server = new McpServer({ name: 'dave', version: '0.1.0' })
          server.registerTool(
            'whoami',
            {
              description: 'The signed-in dave user and the channels they own',
              annotations: { readOnlyHint: true },
            },
            async () => {
              const { data, error } = await supabase
                .from('channels')
                .select('id, slug, name')
                .eq('owner_id', userClaims!.id)
              if (error) throw new Error(error.message)
              const me = { id: userClaims!.id, email: userClaims!.email, channels: data }
              return { content: [{ type: 'text', text: JSON.stringify(me) }] }
            },
          )
          return server
        },
        { onerror: (error) => console.error('MCP request failed', error) },
      )
      return handler.fetch(req)
    },
  ),
)
