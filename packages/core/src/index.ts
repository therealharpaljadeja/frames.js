import {
  CastId,
  FrameActionData,
  FrameActionMessage,
  HubRpcClient,
  Message,
  MessageType,
  getSSLHubRpcClient,
} from "@farcaster/hub-nodejs";
import * as cheerio from "cheerio";

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

export function parseFrame({
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

export function getHubClient(): HubRpcClient {
  return getSSLHubRpcClient(
    process.env.FRAME_HUB_URL ||
      process.env.HUB_URL ||
      "nemes.farcaster.xyz:2283"
  );
}

export async function getFrameMessage(
  body: any,
  options?: { ignoreSignature?: boolean }
): Promise<{
  isValid: boolean;
  message: FrameActionMessage | undefined;
}> {
  options = options || {};

  const frameMessage: Message = Message.decode(
    Buffer.from(body?.trustedData?.messageBytes ?? "", "hex")
  );

  const client = getHubClient();
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

export function getFrameActionData(
  message: FrameActionMessage
): FrameActionData | undefined {
  return message?.data as FrameActionData;
}

export function normalizeCastId(castId: CastId): {
  fid: number;
  hash: `0x${string}`;
} {
  return {
    fid: castId.fid,
    hash: ("0x" + Buffer.from(castId.hash).toString("hex")) as `0x${string}`,
  };
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

export function frameMetadataToHtmlResponse(
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
