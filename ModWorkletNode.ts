interface ModWorkletNodeOptions extends AudioWorkletNodeOptions {
  processorOptions: {
    buffer: Uint8Array;
    ext: string;
    options?: {
      autoplay?: boolean;
      repeat?: boolean;
    };
  };
}

export class ModWorkletNode extends AudioWorkletNode {
  constructor(
    context: BaseAudioContext,
    name: string,
    options?: ModWorkletNodeOptions
  ) {
    super(context, name, options);
  }
}
