import { WritableConsumableStream, WritableStreamConsumer } from "@socket-mesh/writable-consumable-stream";
import { DemuxedConsumableStream } from "./demuxed-consumable-stream.js";
import { StreamDemuxStats } from "./stream-demux-stats.js";

export interface StreamEvent<T> {
	stream: string,
	value: T
}

export class StreamDemux<T> {
	private _nextConsumerId: number;
	private _allEventsStream: WritableConsumableStream<StreamEvent<T>>;

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

		if (this._allEventsStream) {
			this._allEventsStream.write({ stream: streamName, value });
		}
	}

	close(): void;
	close(consumerId: number, value?: T): void;
	close(streamName: string, value?: T): void;
	close(streamName: string | number = '', value?: T): void {
		if (typeof streamName === 'number') {
			for (let stream of Object.values(this.streams)) {
				if (stream.hasConsumer(streamName)) {
					return stream.closeConsumer(streamName, value);
				}
			}
			return;
		}

		if (streamName) {
			if (this._allEventsStream) {
				this._allEventsStream.write({ stream: streamName, value });
			}

			if (this.streams[streamName]) {
				this.streams[streamName].close(value);
			}
		} else {
			this._allEventsStream.close();
		}
	}

	closeAll(value?: T) {
		for (let [streamName, stream] of Object.entries(this.streams)) {
			if (this._allEventsStream) {
				this._allEventsStream.write({ stream: streamName, value });
			}

			stream.close(value);
		}

		if (this._allEventsStream) {
			this._allEventsStream.close();
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

			if (this._allEventsStream) {
				allStatsList.push(...this.getConsumerStats(''));
			} 

			for (let streamName of Object.keys(this.streams)) {
				allStatsList.push(...this.getConsumerStats(streamName));
			}
			
			return allStatsList;
		}

		if (consumerId === '') {
			return (
				!this._allEventsStream ? [] :
					this._allEventsStream
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

		if (this._allEventsStream && this._allEventsStream.hasConsumer(consumerId)) {
			return {
				stream: '',
				...this._allEventsStream.getConsumerStats(consumerId)
			};
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

	kill(): void;
	kill(consumerId: number, value?: T): void;
	kill(streamName: string, value?: T): void;
	kill(streamName: string | number = '', value?: T): void {
		if (typeof streamName === 'number') {
			for (let stream of Object.values(this.streams)) {
				if (stream.hasConsumer(streamName)) {
					return stream.killConsumer(streamName, value);
				}
			}
			return;
		}

		if (streamName && this.streams[streamName]) {
			if (this._allEventsStream) {
				this._allEventsStream.write({ stream: streamName, value });
			}

			this.streams[streamName].kill(value);
		}
		
		if (!streamName && this._allEventsStream) {
			this._allEventsStream.kill();
		}
	}

	killAll(value?: T) {
		for (let [streamName, stream] of Object.entries(this.streams)) {
			if (this._allEventsStream) {
				this._allEventsStream.write({ stream: streamName, value });
			}
			
			stream.kill(value);
		}

		if (this._allEventsStream) {
			this._allEventsStream.kill();
		}
	}

	getBackpressure(streamName?: string): number;
	getBackpressure(consumerId: number): number;
	getBackpressure(streamName?: string | number): number {
		if (typeof streamName === 'string') {

			if (!streamName) {
				return this._allEventsStream?.getBackpressure() ?? 0;
			}

			if (this.streams[streamName]) {
				return this.streams[streamName].getBackpressure();
			}
			return 0;
		}

		if (typeof streamName === 'number') {
			if (this._allEventsStream && this._allEventsStream.hasConsumer(streamName)) {
				return this._allEventsStream.getBackpressure(streamName);
			}

			for (let stream of Object.values(this.streams)) {
				if (stream.hasConsumer(streamName)) {
					return stream.getBackpressure(streamName);
				}
			}
			return 0;
		}

		return Object.values(this.streams).reduce(
			(max, stream) => Math.max(max, stream.getBackpressure()),
			this._allEventsStream?.getBackpressure() ?? 0
		);
	}

	hasConsumer(consumerId: number): boolean;
	hasConsumer(streamName: string, consumerId: number): boolean;
	hasConsumer(streamName: string | number, consumerId?: number): boolean {
		if (typeof streamName === 'number') {
			return this._allEventsStream?.hasConsumer(streamName) || Object.values(this.streams).some(stream => stream.hasConsumer(streamName));
		}

		if (streamName && this.streams[streamName]) {
			return this.streams[streamName].hasConsumer(consumerId);
		}

		if (!streamName && this._allEventsStream) {
			return this._allEventsStream.hasConsumer(consumerId);
		}

		return false;
	}

	getConsumerCount(streamName?: string): number {
		if (!streamName && this._allEventsStream) {
			return this._allEventsStream.getConsumerCount();
		}

		if (streamName && this.streams[streamName]) {
			return this.streams[streamName].getConsumerCount();
		}
		return 0;
	}

	createConsumer(timeout?: number): WritableStreamConsumer<StreamEvent<T>, StreamEvent<T>>;
	createConsumer(streamName: string, timeout?: number): WritableStreamConsumer<T, T>;
	createConsumer(
		streamName?: string | number, timeout?: number
	): WritableStreamConsumer<StreamEvent<T>, StreamEvent<T>> | WritableStreamConsumer<T, T> {
		if (!streamName) {
			streamName = '';
		} else if (typeof streamName === 'number') {
			timeout = streamName;
			streamName = '';
		}

		if (!streamName) {
			if (!this._allEventsStream) {
				this._allEventsStream = new WritableConsumableStream({
					generateConsumerId: this.generateConsumerId,
					removeConsumerCallback: () => {
						if (!this.getConsumerCount('')) {
							this._allEventsStream = null;
						}
					}
				});
			}

			return this._allEventsStream.createConsumer(timeout);
		}

		if (!this.streams[streamName]) {
			this.streams[streamName] = new WritableConsumableStream({
				generateConsumerId: this.generateConsumerId,
				removeConsumerCallback: () => {
					if (!this.getConsumerCount(streamName as string)) {
						delete this.streams[streamName];
					}
				}
			});
		}
		return this.streams[streamName].createConsumer(timeout);
	}

	// Unlike individual consumers, consumable streams support being iterated
	// over by multiple for-await-of loops in parallel.
	listen(): DemuxedConsumableStream<StreamEvent<T>>;
	listen<U extends T, V = U>(streamName: string): DemuxedConsumableStream<V>;
	listen(streamName: string = ''): DemuxedConsumableStream<StreamEvent<T>>| DemuxedConsumableStream<T> {
		return new DemuxedConsumableStream<T>(this, streamName);
	}

	unlisten(streamName = ''): void {
		if (!streamName) {
			this._allEventsStream = null;
		} else {
			delete this.streams[streamName];
		}
	}
}