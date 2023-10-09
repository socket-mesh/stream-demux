import { WritableConsumableStream } from "@socket-mesh/writable-consumable-stream";
import { DemuxedConsumableStream } from "./demuxed-consumable-stream.js";
import { DemuxPacket } from "./demux-packet.js";
import { StreamDemuxStats } from "./stream-demux-stats.js";
import { StreamConsumer } from "./stream-consumer.js";

export class StreamDemux<T> {
	private readonly _mainStream: WritableConsumableStream<DemuxPacket<T>, T>;

	constructor() {
		this._mainStream = new WritableConsumableStream<DemuxPacket<T>, T>();
	}

	write(streamName: string, value: T): void {
		this._mainStream.write({
				stream: streamName,
				data: {
					value,
					done: false
				}
			}
		);
	}

	close(consumerId: number, value?: T): void;
	close(streamName: string, value?: T): void;
	close(streamName: string | number, value?: T): void {
		if (typeof streamName === 'number') {
			this._mainStream.closeConsumer(streamName /* consumerId */ , value);
			return;
		}

		this._mainStream.write({
			stream: streamName,
			data: {
				value,
				done: true
			}
		});
	}

	closeAll(value?: T) {
		this._mainStream.close(value);
	}

	writeToConsumer(consumerId: number, value: T): void {
		this._mainStream.writeToConsumer(
			consumerId,
			{
				consumerId,
				data: {
					value,
					done: false
				}
			}
		);
	}

	getConsumerStats(): StreamDemuxStats[];
	getConsumerStats(consumerId: number): StreamDemuxStats;
	getConsumerStats(streamName: string): StreamDemuxStats[];
	getConsumerStats(consumerId?: number | string): StreamDemuxStats | StreamDemuxStats[] {
		if (!consumerId) {
			return this._mainStream.getConsumerStats().map(i => i as StreamDemuxStats);
		}

		if (typeof consumerId === 'string') {
			const consumerList = this._mainStream.getConsumerStats();

			return consumerList.map(i => i as StreamDemuxStats).filter((consumerStats) => {
				return consumerStats.stream === consumerId;
			});
		}

		return this._mainStream.getConsumerStats(consumerId) as StreamDemuxStats;
	}

	kill(consumerId: number, value?: T): void
	kill(streamName: string, value?: T): void
	kill(streamName: string | number, value?: T): void {
		if (typeof streamName === 'number') {
			this._mainStream.killConsumer(streamName /* consumerId */ , value);
			return;
		}

		let consumerList = this.getConsumerStats(streamName);
		let len = consumerList.length;

		for (let i = 0; i < len; i++) {
			this._mainStream.killConsumer(consumerList[i].id, value);
		}
	}

	killAll(value?: T) {
		this._mainStream.kill(value);
	}

	getBackpressure(streamName?: string): number;
	getBackpressure(consumerId: number): number;
	getBackpressure(streamName?: string | number): number {
		if (typeof streamName === 'string') {
			let consumerList = this.getConsumerStats(streamName);
			let len = consumerList.length;

			let maxBackpressure = 0;
			for (let i = 0; i < len; i++) {
				let consumer = consumerList[i];
				if (consumer.backpressure > maxBackpressure) {
					maxBackpressure = consumer.backpressure;
				}
			}
			return maxBackpressure;
		}

		return this._mainStream.getBackpressure(streamName /* consumerId */);
	}

	hasConsumer(consumerId: number): boolean;
	hasConsumer(streamName: string, consumerId: number): boolean;
	hasConsumer(streamName: string | number, consumerId?: number): boolean {
		if (typeof streamName === 'number') {
			return this._mainStream.hasConsumer(streamName);
		}

		const consumerStats = this._mainStream.getConsumerStats(consumerId) as StreamDemuxStats;
		return !!consumerStats && consumerStats.stream === streamName;
	}

	getConsumerCount(streamName?: string): number {
		return this.getConsumerStats(streamName).length;
	}

	createConsumer(streamName: string, timeout?: number, usabilityMode?: boolean): StreamConsumer<T> {
		return new StreamConsumer<T>(
			this._mainStream,
			this._mainStream.nextConsumerId++,
			this._mainStream.tailNode,
			streamName,
			timeout,
			usabilityMode
		);
	}

	// Unlike individual consumers, consumable streams support being iterated
	// over by multiple for-await-of loops in parallel.
	listen<U extends T = T>(streamName: string, usabilityMode?: boolean): DemuxedConsumableStream<U>;
	listen(streamName: string, usabilityMode?: boolean): DemuxedConsumableStream<T> {
		return new DemuxedConsumableStream<T>(this, streamName, usabilityMode);
	}
}