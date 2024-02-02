import { FrameMetadata } from "@framejs/core";
import Image from "next/image";

export function Frame({
  frame,
  url,
  viewOnly = true,
  submitOption,
}: {
  frame: FrameMetadata;
  url: string | null;
  viewOnly?: boolean;
  submitOption: (buttonIndex: number) => void;
}) {
  return (
    <div className="mx-auto">
      <h1>{url}</h1>
      <div className="mx-auto">
        <Image
          src={frame.image}
          alt="Description of the image"
          width={500}
          height={500}
        />
      </div>
      <form action={frame.postUrl} method="post">
        {!viewOnly && (
          <div className="flex">
            {frame.buttons?.map(({ label, action }, index: number) => (
              <button className="flex-grow" onClick={() => submitOption(index)}>
                {index}. {label} {action ? `(${action})` : ""}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
