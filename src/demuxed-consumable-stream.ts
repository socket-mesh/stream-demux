import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { Consumer } from "@socket-mesh/writable-consumable-stream";

interface ConsumerCreator<T, TReturn> {
	createConsumer(streamName: string, timeout?: number): Consumer<T, TReturn>
}

export class DemuxedConsumableStream<T, TReturn> extends ConsumableStream<T, TReturn> {
	name: string;
	private _streamDemux: ConsumerCreator<T, TReturn>;

  constructor(streamDemux: ConsumerCreator<T, TReturn>, name: string) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  createConsumer(timeout?: number): Consumer<T, TReturn> {
    return this._streamDemux.createConsumer(this.name, timeout);
  }
}
