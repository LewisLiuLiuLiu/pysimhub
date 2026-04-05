<script lang="ts">
	import { theme } from '$lib/stores/theme';
	import { Icon } from '$lib/components/icons';
	import { IconButton } from '$lib/components/ui';

	function handleToggle(e: MouseEvent) {
		// Fallback for browsers without View Transitions API
		if (!document.startViewTransition) {
			theme.toggle();
			return;
		}

		// Get click position for the radial reveal origin
		const x = e.clientX;
		const y = e.clientY;

		// Calculate the max radius needed to cover the entire viewport
		const maxRadius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y)
		);

		const transition = document.startViewTransition(() => {
			theme.toggle();
		});

		transition.ready.then(() => {
			document.documentElement.animate(
				{
					clipPath: [
						`circle(0px at ${x}px ${y}px)`,
						`circle(${maxRadius}px at ${x}px ${y}px)`
					]
				},
				{
					duration: 500,
					easing: 'ease-out',
					pseudoElement: '::view-transition-new(root)'
				}
			);
		});
	}
</script>

<IconButton
	icon={$theme === 'dark' ? 'sun' : 'moon'}
	label={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={handleToggle}
	class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
/>
