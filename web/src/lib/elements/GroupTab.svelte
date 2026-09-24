<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiLoading } from '@mdi/js';
  import { generateId } from '$lib/utils/generate-id';

  interface Props {
    filters: string[];
    labels?: string[];
    badges?: (string | undefined)[];
    selected: string;
    label: string;
    loading?: boolean;
    onSelect: (selected: string) => void;
  }

  let { filters, selected, label, labels, badges, loading = false, onSelect }: Props = $props();

  const id = `group-tab-${generateId()}`;

  const badgeClass = (index: number) =>
    `rounded-full px-1.5 text-xs font-semibold ${
      filters[index] === selected
        ? 'bg-white/25 text-gray-900 dark:bg-gray-900/40 dark:text-gray-100'
        : 'bg-gray-300/70 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
    }`;
</script>

<fieldset
  class="flex h-full rounded-2xl bg-gray-200 ring-gray-400 has-focus-visible:ring dark:bg-immich-dark-gray dark:ring-gray-600"
>
  <legend class="sr-only">{label}</legend>
  {#each filters as filter, index (`${id}-${index}`)}
    <div class="group">
      <input
        type="radio"
        name={id}
        id="{id}-{index}"
        class="peer sr-only"
        value={filter}
        checked={filter === selected}
        onchange={() => onSelect(filter)}
      />
      <label
        for="{id}-{index}"
        class="flex h-full cursor-pointer items-center gap-1.5 px-4 text-sm group-first-of-type:rounded-s-2xl group-last-of-type:rounded-e-2xl peer-checked:bg-gray-300 hover:bg-gray-300 peer-checked:dark:bg-gray-700 dark:hover:bg-gray-800"
      >
        {labels?.[index] ?? filter}
        {#if loading && filter === selected}
          <Icon class="animate-spin" data-testid={`group-tab-spinner-${index}`} icon={mdiLoading} size="14" />
        {:else if badges?.[index] !== undefined}
          <span class={badgeClass(index)} data-testid={`group-tab-badge-${index}`}>{badges[index]}</span>
        {/if}
      </label>
    </div>
  {/each}
</fieldset>
