import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { deleteProfile, listProfiles, type Profile, putProfile } from '@/services/storage'

export const profilesQueryKey = ['profiles'] as const

export const useProfileStore = defineStore('profiles', () => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: profilesQueryKey,
    queryFn: listProfiles,
    initialData: [] as Profile[],
  })

  const saveMutation = useMutation({
    mutationFn: (profile: Profile) => putProfile(profile),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profilesQueryKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProfile(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profilesQueryKey }),
  })

  const profiles = computed(() => query.data.value ?? [])
  const isLoading = computed(() => query.isLoading.value)

  async function save(profile: Profile): Promise<void> {
    await saveMutation.mutateAsync(profile)
  }

  async function remove(id: string): Promise<void> {
    await deleteMutation.mutateAsync(id)
  }

  function findById(id: string): Profile | undefined {
    return profiles.value.find((profile) => profile.id === id)
  }

  return {
    findById,
    isLoading,
    profiles,
    remove,
    save,
  }
})
