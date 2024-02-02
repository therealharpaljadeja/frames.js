import {
  CastId,
  FrameActionData,
  FrameActionMessage,
  Message,
  MessageType,
  ValidationResponse,
  VerificationAddEthAddressMessage,
  HubResult,
} from "@farcaster/core";
import * as cheerio from "cheerio";

import { createPublicClient, http, parseAbi } from "viem";
import * as chains from "viem/chains";
import { optimism } from "viem/chains";

type Builtin =
  | Date
  | Function
  | Uint8Array
  | string
  | number
  | boolean
  | undefined;
type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : T extends {}
        ? {
            [K in keyof T]?: DeepPartial<T[K]>;
          }
        : Partial<T>;

interface HubService {
  validateMessage(
    request: DeepPartial<Message>,
    metadata?: any
  ): Promise<HubResult<ValidationResponse>>;
}

export type ValidateFrameMessageOptions = {
  ignoreSignature?: boolean;
};

type Button = {
  label: string;
  action?: "post" | "post_redirect";
};

export type FrameMetadata = {
  version: string;
  // A list of strings which are the label for the buttons in the frame (max 4 buttons).
  buttons?: Button[];
  // An image which must be smaller than 10MB and should have an aspect ratio of 1.91:1
  image: string;
  // Fallback image for clients that do not support frames. (`image` is used if not provided)
  ogImage?: string;
  // A valid POST URL to send the Signature Packet to.
  postUrl?: string;
  // A period in seconds at which the app should expect the image to update.
  refreshPeriod?: number;
};

function parseButtonElement(elem: cheerio.Element) {
  const nameAttr = elem.attribs["name"] || elem.attribs["property"];
  const buttonNumber = nameAttr?.split(":")[3];
  try {
    return {
      buttonNumber: parseInt(buttonNumber || ""),
      content: elem.attribs["content"],
    };
  } catch (error) {
    return null;
  }
}

export function htmlToFrame({
  text,
  url,
}: {
  text: string;
  url?: string;
}): FrameMetadata | null {
  const $ = cheerio.load(text);

  const version = $("meta[property='fc:frame'], meta[name='fc:frame']").attr(
    "content"
  );
  const image = $(
    "meta[property='fc:frame:image'], meta[name='fc:frame:image']"
  ).attr("content");

  // TODO: Useful error messages
  if (!version || !image) {
    return null;
  }

  const postUrl =
    $(
      "meta[property='fc:frame:post_url'], meta[name='fc:frame:post_url']"
    ).attr("content") || url;

  const buttonLabels = $(
    "meta[property^='fc:frame:button']:not([property$=':action']), meta[name^='fc:frame:button']:not([name$=':action'])"
  )
    .map((i, elem) => parseButtonElement(elem))
    .filter((i, elem) => elem !== null)
    .toArray();

  let refreshPeriod = undefined;

  try {
    const refreshPeriodContent = $(
      `meta[property='fc:frame:refresh_period'], meta[name='fc:frame:refresh_period']`
    ).attr("content");
    refreshPeriod = refreshPeriodContent
      ? parseInt(refreshPeriodContent)
      : undefined;
    console.log("refreshPeriod", refreshPeriod);
  } catch (error) {
    console.error(error);
  }

  const buttonActions = $(
    'meta[name^="fc:frame:button:"][name$=":action"], meta[property^="fc:frame:button:"][property$=":action"]'
  )
    .map((i, elem) => parseButtonElement(elem))
    .filter((i, elem) => elem !== null)
    .toArray();

  const buttonsWithActions = buttonLabels
    .map((button): Button & { index: number } => {
      const action = buttonActions.find(
        (action) => action?.buttonNumber === button?.buttonNumber
      );
      return {
        index: button?.buttonNumber || 0,
        label: button?.content || "",
        action: action?.content === "post_redirect" ? "post_redirect" : "post",
      };
    })
    .sort((a, b) => a.index - b.index)
    .map(
      (button): Button => ({
        label: button.label,
        action: button.action,
      })
    )
    // First 4
    .slice(0, 4);

  return {
    version: version,
    image: image,
    buttons: buttonsWithActions,
    postUrl,
    refreshPeriod,
  };
}

export function bytesToHexString(bytes: Uint8Array) {
  return ("0x" + Buffer.from(bytes).toString("hex")) as `0x${string}`;
}

export function normalizeCastId(castId: CastId): {
  fid: number;
  hash: `0x${string}`;
} {
  return {
    fid: castId.fid,
    hash: bytesToHexString(castId.hash),
  };
}

export function getFrameMessageFromRequestBody(body: any) {
  return Message.decode(
    Buffer.from(body?.trustedData?.messageBytes ?? "", "hex")
  );
}

export async function validateFrameMessageWithClient(
  body: any,
  client: HubService,
  options?: ValidateFrameMessageOptions
): Promise<{
  isValid: boolean;
  message: FrameActionMessage | undefined;
}> {
  options = options || {};

  const frameMessage: Message = Message.decode(
    Buffer.from(body?.trustedData?.messageBytes ?? "", "hex")
  );

  const result = await client.validateMessage(frameMessage);
  if (
    result.isOk() &&
    result.value.valid &&
    result.value.message &&
    result.value.message.data?.type === MessageType.FRAME_ACTION
  ) {
    return {
      isValid: result.value.valid,
      message: result.value.message as FrameActionMessage,
    };
  }
  return {
    isValid: false,
    message: undefined,
  };
}

type AddressReturnType<
  Options extends { fallbackToCustodyAddress?: boolean } | undefined,
> = Options extends { fallbackToCustodyAddress: true }
  ? `0x${string}`
  : `0x${string}` | null;

// Function implementation with conditional return type
export async function getAddressForFid<
  Options extends { fallbackToCustodyAddress?: boolean } | undefined,
>({
  fid,
  hubClient,
  options,
}: {
  fid: number;
  hubClient: any;
  options?: Options;
}): Promise<AddressReturnType<Options>> {
  const verificationsResult = await hubClient.getVerificationsByFid({
    fid,
  });
  const verifications = verificationsResult.unwrapOr(null);
  if (verifications?.messages[0]) {
    const {
      data: {
        verificationAddEthAddressBody: { address: addressBytes },
      },
    } = verifications.messages[0] as VerificationAddEthAddressMessage;
    return bytesToHexString(addressBytes);
  } else if (options?.fallbackToCustodyAddress) {
    const publicClient = createPublicClient({
      transport: http(),
      chain: optimism,
    });
    // TODO: Do this async
    const address = await publicClient.readContract({
      abi: parseAbi(["function custodyOf(uint256 fid) view returns (address)"]),
      // TODO Extract into constants file
      address: "0x00000000fc6c5f01fc30151999387bb99a9f489b",
      functionName: "custodyOf",
      args: [BigInt(fid)],
    });
    return address;
  } else {
    return null as AddressReturnType<Options>;
  }
}

export function frameMetadataToHtml(frame: FrameMetadata) {
  return `<meta property="og:image" content="${frame.ogImage || frame.image}">
  <meta name="fc:frame" content="vNext">
  <meta name="fc:frame:image" content="${frame.image}">
  <meta name="fc:frame:post_url" content="${frame.postUrl}">
  ${
    frame.buttons
      ?.map(
        (button, index) =>
          `<meta name="fc:frame:button:${index + 1}" content="${button.label}">
        <meta name="fc:frame:button:${index + 1}:action" content="${button.action}">`
      )
      .join("\n") || ""
  }
  ${frame.refreshPeriod ? `<meta name="fc:frame:refresh_period" content="${frame.refreshPeriod}">` : ""}
  `;
}

export function frameMetadataToNextMetadata(frame: FrameMetadata) {
  const metadata: any = {
    "fc:frame": frame.version,
    "fc:frame:image": frame.image,
    "fc:frame:post_url": frame.postUrl,
    "fc:frame:refresh_period": frame.refreshPeriod,
  };

  frame.buttons?.forEach((button, index) => {
    metadata[`fc:frame:button:${index + 1}`] = button.label;
    metadata[`fc:frame:button:${index + 1}:action`] = button.action;
  });

  return metadata;
}

export function frameMetadataToHtmlText(
  frame: FrameMetadata,
  options: {
    og?: { title: string };
    title?: string;
    htmlBody?: string;
    htmlHead?: string;
  } = {}
) {
  options = options || {};

  const html = `<!DOCTYPE html>
  <html>
    <head>
      ${options.title ? `<title>${options.title}</title>` : ""}
      ${options.og?.title ? `<meta property="og:title" content="${options.og.title}">` : ""}
      ${frameMetadataToHtml(frame)}
      ${options.htmlHead || ""}
    </head>
    <body>${options.htmlBody}</body>
  </html>`;
  return html;
}
