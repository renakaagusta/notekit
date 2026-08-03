import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    return new Response(
      JSON.stringify({
        status: 'ok',
        timestamp: Date.now(),
        environment: import.meta.env.NODE_ENV || 'production',
        chainId: import.meta.env.PUBLIC_CHAIN_ID,
        chainName: import.meta.env.PUBLIC_CHAIN_NAME,
        domain: import.meta.env.PUBLIC_DOMAIN,
        service: 'landing-page',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ status: 'error', message: 'Health check failed' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
