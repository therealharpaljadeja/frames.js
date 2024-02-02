import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Frame } from "./components/frame";
import { FrameMetadata } from "@framejs/core";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function Page(): JSX.Element {
  const params = useSearchParams();
  const url = params.get("url");
  const [frame, setFrame] = useState<any>(null);
  const [privateKeyInput, setPrivateKeyInput] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<FrameMetadata>(
    `/api/og?url=${url}`,
    fetcher
  );

  if (error) return <div>failed to load</div>;
  if (isLoading) return <div>loading...</div>;
  if (!frame) return <div>something is wrong...</div>;

  const submitOption = async (buttonIndex: number) => {
    const framePacket = {
      untrustedData: {
        fid: 2,
        url: "https://fcpolls.com/polls/1",
        messageHash: "0xd2b1ddc6c88e865a33cb1a565e0058d757042974",
        timestamp: 1706243218,
        network: 1,
        buttonIndex,
        castId: {
          fid: 226,
          hash: "0xa48dd46161d8e57725f5e26e34ec19c13ff7f3b9",
        },
      },
      trustedData: {
        messageBytes: "d2b1ddc6c88e865a33cb1a565e0058d757042974...",
      },
    };

    const response = await fetch(`/api/og?url=${url}&option=${buttonIndex}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(framePacket),
    });
    const data = await response.json();
    setFrame(data);
  };

  return (
    <div className="p-5 flex justify-center flex-col">
      <div className="mx-auto text-center flex flex-col w-full md:w-1/2">
        <Frame
          frame={frame}
          url={url}
          submitOption={submitOption}
          viewOnly={privateKey === null}
        />
        {!privateKey && (
          <div>
            <div>Load private key</div>
            <input
              type="text"
              value={privateKeyInput}
              onChange={(e) => setPrivateKeyInput(e.target.value)}
              placeholder="Private key..."
            />
            <button
              onClick={() => {
                setPrivateKey(privateKeyInput);
                localStorage.setItem("privateKey", privateKeyInput);
              }}
            >
              Load
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
