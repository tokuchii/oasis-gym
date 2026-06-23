<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()

const icons: Record<string, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

const colors: Record<string, string> = {
  success: 'border-green-400/50 bg-green-400/10 text-green-400',
  error: 'border-red-400/50 bg-red-400/10 text-red-400',
  warning: 'border-yellow-400/50 bg-yellow-400/10 text-yellow-400',
  info: 'border-gold/50 bg-gold/10 text-gold',
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-2 px-3 py-2.5 border rounded-sm shadow-lg backdrop-blur-sm cursor-pointer transition-all"
        :class="colors[toast.type]"
        @click="remove(toast.id)"
      >
        <span class="text-sm mt-0.5 shrink-0">{{ icons[toast.type] }}</span>
        <p class="text-[11px] sm:text-xs leading-relaxed">{{ toast.message }}</p>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active { animation: toast-in 0.3s ease-out; }
.toast-leave-active { animation: toast-out 0.2s ease-in; }
@keyframes toast-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
@keyframes toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
</style>
