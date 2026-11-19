<script setup lang="ts">
const { isLight, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    role="switch"
    aria-label="Light mode"
    :aria-checked="isLight ? 'true' : 'false'"
    :title="isLight ? 'Switch to dark mode' : 'Switch to light mode'"
    class="group relative inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center border border-iron text-mist transition-colors hover:border-gold/60 hover:text-gold"
    @click="toggle($event)"
  >
    <svg
      class="h-4 w-4 sm:h-[18px] sm:w-[18px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <g class="theme-icon theme-icon-sun">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </g>
      <path class="theme-icon theme-icon-moon" d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-icon {
  transform-origin: 12px 12px;
  transition:
    transform 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s ease;
}

.theme-icon-sun {
  opacity: 0;
  transform: rotate(-90deg) scale(0.4);
}

.theme-icon-moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

[aria-checked='true'] .theme-icon-sun {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

[aria-checked='true'] .theme-icon-moon {
  opacity: 0;
  transform: rotate(90deg) scale(0.4);
}

@media (prefers-reduced-motion: reduce) {
  .theme-icon {
    transition: none;
  }
}
</style>
