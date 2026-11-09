<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()

const icons: Record<string, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

const iconColors: Record<string, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}
</script>

<template>
  <div
    class="fixed left-1/2 z-[9999] flex w-[min(360px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col items-center gap-2 pointer-events-none"
    :style="{ top: 'max(12px, env(safe-area-inset-top))' }"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto w-full cursor-pointer rounded-[22px] border border-white/10 bg-[#1c1c1e]/85 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        role="status"
        @click="remove(toast.id)"
      >
        <div class="mb-1.5 flex items-center gap-2">
          <img src="/favicon.svg" alt="" class="h-4 w-4 rounded-[4px]" width="16" height="16" />
          <span class="text-[11px] font-medium text-white/55">OASIS Fitness Gym</span>
          <span class="ml-auto text-[11px] text-white/35">now</span>
        </div>
        <div class="flex items-start gap-2.5">
          <span
            class="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            :class="iconColors[toast.type]"
          >{{ icons[toast.type] }}</span>
          <p class="text-[13px] leading-snug text-white/95">{{ toast.message }}</p>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active { animation: ios-toast-in 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
.toast-leave-active { animation: ios-toast-out 0.3s ease-in forwards; }
.toast-move { transition: transform 0.3s ease; }
@keyframes ios-toast-in {
  from { opacity: 0; transform: translateY(-120%); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ios-toast-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-60%); }
}
</style>
