/**
 * Web Worker for generating query embeddings using transformers.js.
 * The model is loaded once and cached in IndexedDB by transformers.js.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/bge-small-en-v1.5';

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
	if (extractor) return extractor;
	if (loading) return loading;

	loading = pipeline('feature-extraction', MODEL_ID, {
		progress_callback: (progress: { status: string; progress?: number }) => {
			self.postMessage({ type: 'progress', ...progress });
		}
	}) as Promise<FeatureExtractionPipeline>;

	extractor = await loading;
	loading = null;
	return extractor;
}

self.onmessage = async (e: MessageEvent) => {
	const { type, query, id } = e.data;

	if (type === 'preload') {
		try {
			await getExtractor();
			self.postMessage({ type: 'ready' });
		} catch (err) {
			self.postMessage({ type: 'error', error: String(err) });
		}
		return;
	}

	if (type === 'embed') {
		try {
			const ext = await getExtractor();
			const result = await ext(query, { pooling: 'mean', normalize: true });
			const vector = Array.from(result.data as Float32Array);
			self.postMessage({ type: 'result', id, vector });
		} catch (err) {
			self.postMessage({ type: 'error', id, error: String(err) });
		}
	}
};
