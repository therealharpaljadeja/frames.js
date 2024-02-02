import { htmlToFrame } from "@framejs/core";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response("Invalid URL", { status: 400 });
  }

  const urlRes = await fetch(url);
  const data = await urlRes.text();

  const frameMetadata = htmlToFrame({ text: data, url: url });

  if (!frameMetadata) {
    return new Response("Invalid frame", { status: 400 });
  }

  return Response.json(frameMetadata);
}
