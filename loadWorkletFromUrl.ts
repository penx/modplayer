import { ModWorkletNode } from "./ModWorkletNode";

const supportedformats = ["mod", "s3m", "xm"];

export const loadWorkletFromUrl = async (
  url: string,
  context: AudioContext,
  {
    options,
    workletName = "ModWorkletProcessor",
  }: {
    options?: {
      autoplay?: boolean;
      repeat?: boolean;
    };
    workletName?: string;
  }
) => {
  let ext = url.split(".").pop()?.toLowerCase().trim();
  if (!ext || supportedformats.indexOf(ext) == -1) {
    // unknown extension, maybe amiga-style prefix?
    ext = url.split("/").pop()?.split(".").shift()?.toLowerCase().trim();
    if (!ext || supportedformats.indexOf(ext) == -1) {
      // ok, give up
      throw new Error(`Unsupported file extension ${ext}`);
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error, status = ${response.status}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());

  return new ModWorkletNode(context, workletName, {
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      ext,
      buffer,
      options,
    },
  });
};
