import { browser } from '$app/environment';

interface EmbeddingsData {
	model: string;
	dimensions: number;
	embeddings: Record<string, number[]>;
}

let worker: Worker | null = null;
let embeddings: EmbeddingsData | null = null;
let ready = false;
let requestId = 0;
const pending = new Map<number, { resolve: (v: number[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
	if (!browser) return null;
	if (worker) return worker;

	worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), {
		type: 'module'
	});

	worker.onmessage = (e) => {
		const { type, id, vector, error } = e.data;

		if (type === 'ready') {
			ready = true;
			return;
		}

		if (type === 'result' && pending.has(id)) {
			pending.get(id)!.resolve(vector);
			pending.delete(id);
		}

		if (type === 'error' && id !== undefined && pending.has(id)) {
			pending.get(id)!.reject(new Error(error));
			pending.delete(id);
		}
	};

	return worker;
}

function embedQuery(query: string): Promise<number[]> {
	return new Promise((resolve, reject) => {
		const w = getWorker();
		if (!w) return reject(new Error('No worker'));
		const id = ++requestId;
		pending.set(id, { resolve, reject });
		w.postMessage({ type: 'embed', query, id });
	});
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
	}
	// Vectors are pre-normalized, so dot product = cosine similarity
	return dot;
}

export async function loadEmbeddings(): Promise<void> {
	if (embeddings || !browser) return;
	try {
		const res = await fetch('/data/embeddings.json');
		if (res.ok) {
			embeddings = await res.json();
		}
	} catch {
		console.warn('Failed to load embeddings');
	}
}

export function preloadModel(): void {
	const w = getWorker();
	if (w && !ready) {
		w.postMessage({ type: 'preload' });
	}
}

export function isReady(): boolean {
	return ready && embeddings !== null;
}

/**
 * Returns a map of project id -> similarity score (0-1).
 * Returns null if semantic search is unavailable.
 */
export async function semanticSearch(query: string): Promise<Map<string, number> | null> {
	if (!embeddings) return null;

	try {
		const queryVector = await embedQuery(query);
		const scores = new Map<string, number>();

		for (const [id, vector] of Object.entries(embeddings.embeddings)) {
			scores.set(id, cosineSimilarity(queryVector, vector));
		}

		return scores;
	} catch {
		return null;
	}
}
