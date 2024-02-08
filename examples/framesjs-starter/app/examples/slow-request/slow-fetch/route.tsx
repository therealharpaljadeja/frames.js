import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getFrameMessage } from "frames.js";
import { Dalle } from "./dall-e";
// extend this endpoint to 5 min timeout
export const maxDuration = 300;

export type SetState = {
  status: "error" | "success" | "pending";
  timestamp: number;
  error: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json();

  // verify independently
  const frameMessage = await getFrameMessage(body.postBody, {
    hubHttpUrl: "https://hub.freefarcasterhub.com:3281",
    fetchHubContext: true,
  });

  const uniqueId = `fid:${frameMessage.requesterFid}`;
  const prompt = frameMessage.inputText;
  if (!prompt) {
    // set error, return
    await kv.set(uniqueId, {
      error: "no prompt",
      status: "pending",
      timestamp: new Date().getTime(),
    });

    return NextResponse.json({ message: "no prompt set" }, { status: 400 });
  }
  const { data, error } = await Dalle(prompt, frameMessage.requesterFid);

  if (error) {
    try {
      await kv.hset(uniqueId, {
        error,
        ...data,
        status: "error",
        timestamp: new Date().getTime(),
      });
      return NextResponse.json({ message: error }, { status: 500 });
    } catch (err) {
      return NextResponse.json({ message: err }, { status: 500 });
    }
  }

  try {
    await kv.hset(uniqueId, {
      error,
      ...data,
      status: "success",
      timestamp: new Date().getTime(),
    });

    // since this request isn't awaited, doesn't do anything
    return NextResponse.json({
      error,
      ...data,
      status: "success",
      timestamp: new Date().getTime(),
    });
  } catch (err) {
    // Handle errors
    return NextResponse.json({ message: err }, { status: 500 });
  }
}
