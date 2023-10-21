import { WritableConsumableStream, WritableStreamConsumer } from "@socket-mesh/writable-consumable-stream";
import { DemuxedConsumableStream } from "./demuxed-consumable-stream.js";
import { StreamDemuxStats } from "./stream-demux-stats.js";

export class StreamDemux<T> {
	private _nextConsumerId: number;

	streams: {[name: string] : WritableConsumableStream<T> };
	generateConsumerId: () => number;

	constructor() {
		this.streams = {};
		this._nextConsumerId = 1;
		this.generateConsumerId = () => {
			return this._nextConsumerId++;
		};
	}

	write(streamName: string, value: T): void {
		if (this.streams[streamName]) {
			this.streams[streamName].write(value);
		}
	}

	close(consumerId: number, value?: T): void;
	close(streamName: string, value?: T): void;
	close(streamName: string | number, value?: T): void {
		if (typeof streamName === 'number') {
			for (let stream of Object.values(this.streams)) {
				if (stream.hasConsumer(streamName)) {
					return stream.closeConsumer(streamName, value);
				}
			}
			return;
		}

		if (this.streams[streamName]) {
			this.streams[streamName].close(value);
		}
	}

	closeAll(value?: T) {
		for (let stream of Object.values(this.streams)) {
			stream.close(value);
		}
	}

	writeToConsumer(consumerId: number, value: T): void {
		for (let stream of Object.values(this.streams)) {
			if (stream.hasConsumer(consumerId)) {
				return stream.writeToConsumer(consumerId, value);
			}
		}
	}

	getConsumerStats(): StreamDemuxStats[];
	getConsumerStats(consumerId: number): StreamDemuxStats;
	getConsumerStats(streamName: string): StreamDemuxStats[];
	getConsumerStats(consumerId?: number | string): StreamDemuxStats | StreamDemuxStats[] {
		if (consumerId === undefined) {
			const allStatsList = [];

			for (let streamName of Object.keys(this.streams)) {
				const statsList = this.getConsumerStats(streamName);

				for (let stats of statsList) {
					allStatsList.push(stats);
				}
			}
			
			return allStatsList;
		}

		if (typeof consumerId === 'string') {
			return (
				!this.streams[consumerId] ? [] :
					this.streams[consumerId]
						.getConsumerStats()
						.map(
							(stats) => {
								return {
									...stats,
									stream: consumerId
								};
							}
						)
			);
		}

		for (let [streamName, stream] of Object.entries(this.streams)) {
			if (stream.hasConsumer(consumerId)) {
				return {
					stream: streamName,
					...stream.getConsumerStats(consumerId)
				};
			}
		}
		
		return undefined;		
	}

	kill(consumerId: number, value?: T): void
	kill(streamName: string, value?: T): void
	kill(streamName: string | number, value?: T): void {
		if (typeof streamName === 'number') {
			for (let stream of Object.values(this.streams)) {
				if (stream.hasConsumer(streamName)) {
					return stream.killConsumer(streamName, value);
				}
			}
			return;
		}

		if (this.streams[streamName]) {
			this.streams[streamName].kill(value);
		}
	}

	killAll(value?: T) {
		for (let stream of Object.values(this.streams)) {
			stream.kill(value);
		}
	}

	getBackpressure(streamName?: string): number;
	getBackpressure(consumerId: number): number;
	getBackpressure(streamName?: string | number): number {
		if (typeof streamName === 'string') {
			if (this.streams[streamName]) {
				return this.streams[streamName].getBackpressure();
			}
			return 0;
		}

		if (typeof streamName === 'number') {
			for (let stream of Object.values(this.streams)) {
				if (stream.hasConsumer(streamName)) {
					return stream.getBackpressure(streamName);
				}
			}
			return 0;			
		}

		return Object.values(this.streams).reduce(
			(max, stream) => Math.max(max, stream.getBackpressure()),
			0
		);
	}

	hasConsumer(consumerId: number): boolean;
	hasConsumer(streamName: string, consumerId: number): boolean;
	hasConsumer(streamName: string | number, consumerId?: number): boolean {
		if (typeof streamName === 'number') {
			return Object.values(this.streams).some(stream => stream.hasConsumer(streamName));
		}

		if (this.streams[streamName]) {
			return this.streams[streamName].hasConsumer(consumerId);
		}
		return false;		
	}

	getConsumerCount(streamName?: string): number {
		if (this.streams[streamName]) {
			return this.streams[streamName].getConsumerCount();
		}
		return 0;
	}

	createConsumer(streamName: string, timeout?: number): WritableStreamConsumer<T, T> {
		if (!this.streams[streamName]) {
			this.streams[streamName] = new WritableConsumableStream({
				generateConsumerId: this.generateConsumerId,
				removeConsumerCallback: () => {
					if (!this.getConsumerCount(streamName)) {
						delete this.streams[streamName];
					}
				}
			});
		}
		return this.streams[streamName].createConsumer(timeout);
	}

	// Unlike individual consumers, consumable streams support being iterated
	// over by multiple for-await-of loops in parallel.
	listen<U extends T = T>(streamName: string): DemuxedConsumableStream<U>;
	listen(streamName: string): DemuxedConsumableStream<T> {
		return new DemuxedConsumableStream<T>(this, streamName);
	}

	unstream(streamName: string): void {
		delete this.streams[streamName];
	}	
}