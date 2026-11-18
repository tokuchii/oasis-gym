const dataVersion = ref(0)

export function useDataVersion() {
  function bumpDataVersion() {
    dataVersion.value++
  }

  return { dataVersion, bumpDataVersion }
}
