const SCRIPT_URL =
  "https://raw.githubusercontent.com/nenjo-ai/nenjo/main/nenjoup";

export async function GET() {
  const res = await fetch(SCRIPT_URL, { next: { revalidate: 300 } });

  if (!res.ok) {
    return new Response("Failed to fetch install script", { status: 502 });
  }

  const script = await res.text();

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
