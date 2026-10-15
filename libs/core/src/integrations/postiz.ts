export const listIntegrations = async (apiUrl: string, apiKey: string) => {
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/public/v1/integrations`, {
    headers: { Authorization: apiKey },
  });
  if (!response.ok) {
    throw new Error(`GET /public/v1/integrations failed: ${response.status}`);
  }
  return (await response.json()) as Array<{ id: string; disabled: boolean }>;
};
