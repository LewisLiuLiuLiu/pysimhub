import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Project } from '$lib/types/project';
import { semanticSearch } from '$lib/utils/semantic-search';

const fuseOptions: IFuseOptions<Project> = {
	keys: [
		{ name: 'name', weight: 2 },
		{ name: 'tagline', weight: 1.5 },
		{ name: 'tags', weight: 1.2 },
		{ name: 'description', weight: 0.5 }
	],
	threshold: 0.4,
	ignoreLocation: true,
	includeScore: true
};

let fuseInstance: Fuse<Project> | null = null;

export function initSearch(projects: Project[]): void {
	fuseInstance = new Fuse(projects, fuseOptions);
}

// Fuse score is 0 (perfect) to 1 (worst), flip it to 0-1 relevance
function fuseScoreToRelevance(score: number): number {
	return 1 - score;
}

const FUSE_WEIGHT = 0.4;
const SEMANTIC_WEIGHT = 0.6;

export async function searchProjects(query: string, projects: Project[]): Promise<Project[]> {
	if (!query.trim()) return projects;

	if (!fuseInstance) initSearch(projects);

	const fuseResults = fuseInstance!.search(query);

	// Build fuse scores map
	const fuseScores = new Map<string, number>();
	for (const r of fuseResults) {
		fuseScores.set(r.item.id, fuseScoreToRelevance(r.score ?? 0.5));
	}

	// Try semantic search (non-blocking, returns null if unavailable)
	const semanticScores = await semanticSearch(query);

	if (!semanticScores) {
		// Fallback: fuse-only
		return fuseResults.map((r) => r.item);
	}

	// Hybrid scoring: combine both signals
	const scored: Array<{ project: Project; score: number }> = [];

	// Collect all project IDs that appear in either result set
	const allIds = new Set<string>([...fuseScores.keys(), ...semanticScores.keys()]);
	const projectMap = new Map(projects.map((p) => [p.id, p]));

	for (const id of allIds) {
		const project = projectMap.get(id);
		if (!project) continue;

		const fScore = fuseScores.get(id) ?? 0;
		const sScore = Math.max(0, semanticScores.get(id) ?? 0);

		// If a project only appears via semantic (not fuse), apply a lower weight
		// to avoid surfacing completely irrelevant keyword mismatches
		const hasFuse = fuseScores.has(id);
		const hybridScore = hasFuse
			? FUSE_WEIGHT * fScore + SEMANTIC_WEIGHT * sScore
			: sScore * 0.8; // semantic-only results get a slight penalty

		// Filter out very low scoring results
		if (hybridScore < 0.15) continue;

		scored.push({ project, score: hybridScore });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.project);
}

export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
}
