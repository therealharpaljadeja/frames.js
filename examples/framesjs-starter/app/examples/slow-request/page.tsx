import {
  FrameButton,
  FrameContainer,
  FrameImage,
  FrameInput,
  FrameReducer,
  NextServerPageProps,
  getPreviousFrame,
  useFramesReducer,
  getFrameMessage,
} from "frames.js/next/server";
import Link from "next/link";
import { kv } from "@vercel/kv";

type State = {
  page: "homeframe";
};

const initialState = { page: 1 };

const reducer: FrameReducer<State> = (state, action) => {
  return {
    page: "homeframe",
  };
};

// This is a react server component only
export default async function Home({
  params,
  searchParams,
}: NextServerPageProps) {
  const previousFrame = getPreviousFrame<State>(searchParams);

  const frameMessage = await getFrameMessage(previousFrame.postBody, {
    hubHttpUrl: "https://hub.freefarcasterhub.com:3281",
    fetchHubContext: true,
  });

  if (frameMessage && !frameMessage?.isValid) {
    throw new Error("Invalid frame payload");
  }

  const [state, dispatch] = useFramesReducer<State>(
    reducer,
    initialState,
    previousFrame
  );

  const { castId, requesterFid } = frameMessage;

  if (state.page === 2)
    // unique to fid & not cast hash
    const uniqueId = `fid:${requesterFid}`;

  const existingRequests = await kv.hgetall(uniqueId);
  if (existingRequests) {
    // Check status of request
  } else {
    // start request, don't await it! Return a loading page, let this run in the background
    fetch(`/slow-fetch`, {
      method: "POST",
      body: JSON.stringify({
        postBody: previousFrame.postBody,
        params,
        searchParams,
      }),
    });
  }

  let frame;

  if (state.page === 1) {
    frame = (
      <FrameContainer
        postUrl="/frames"
        state={state}
        previousFrame={previousFrame}
      >
        {/* <FrameImage src="https://framesjs.org/og.png" /> */}
        <FrameImage>
          <div tw="w-full h-full bg-slate-700 text-white justify-center items-center">
            {frameMessage?.inputText ? frameMessage.inputText : "Prompt dall-e"}
          </div>
        </FrameImage>
        <FrameInput text="prompt dall-e" />
        <FrameButton onClick={dispatch}>Imagine</FrameButton>
      </FrameContainer>
    );
  }

  // then, when done, return next frame
  return (
    <div className="p-4">
      frames.js starter kit with slow requests.{" "}
      <Link
        href={`/debug?url=${process.env.NEXT_PUBLIC_HOST || "http://localhost:3000"}`}
        className="underline"
      >
        Debug
      </Link>
      {frame}
    </div>
  );
}
