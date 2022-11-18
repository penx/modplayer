import { ModWorkletNode } from "./ModWorkletNode";

export const loadWorkletFromBuffer = (
  ext: string,
  buffer: Uint8Array,
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
