const SCRIPT_URL =
  "https://raw.githubusercontent.com/nenjo-ai/nenjo/main/install.sh";

export async function GET() {
  return Response.redirect(SCRIPT_URL, 307);
}
