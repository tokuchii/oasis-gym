<script setup lang="ts">
import { useOnlineStatus } from '~/composables/useOnlineStatus'
import { useWriteQueue } from '~/composables/useWriteQueue'

const { isOnline, wasOffline } = useOnlineStatus()
const { queueLength, sync, syncing } = useWriteQueue()
</script>

<template>
  <div v-if="!isOnline || queueLength > 0" class="fixed bottom-4 right-4 z-50">
    <div
      class="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium backdrop-blur-md"
      :class="isOnline ? 'bg-green-900/90 text-green-300 border border-green-700' : 'bg-red-900/90 text-red-300 border border-red-700'"
    >
      <span class="w-2 h-2 rounded-full" :class="isOnline ? 'bg-green-400' : 'bg-red-400 animate-pulse'" />
      <span v-if="!isOnline">Offline</span>
      <span v-if="queueLength > 0" class="ml-1">
        {{ queueLength }} queued
        <button v-if="isOnline" class="ml-2 underline hover:text-white" :disabled="syncing" @click="sync">
          {{ syncing ? 'Syncing...' : 'Sync now' }}
        </button>
      </span>
    </div>
  </div>
  <Transition name="fade">
    <div v-if="wasOffline && isOnline" class="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-900/90 text-green-300 border border-green-700 px-4 py-2 rounded-lg text-xs font-medium shadow-lg">
      Back online
    </div>
  </Transition>
</template>
