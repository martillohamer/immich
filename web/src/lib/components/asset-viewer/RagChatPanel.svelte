<script lang="ts">
  import { t } from 'svelte-i18n';
  import { ragChatManager } from '$lib/stores/rag-chat.svelte';
  import { transcriptManager } from '$lib/stores/transcript.svelte';
  import { formatTimestamp } from '$lib/utils/transcript-rag';

  let {
    assetId,
    currentTime,
    onSeek,
  }: {
    assetId: string;
    currentTime: number;
    onSeek: (time: number) => void;
  } = $props();

  let input = $state('');
  let listElement: HTMLDivElement | undefined = $state();

  let messages = $derived(ragChatManager.getMessages(assetId));
  let responding = $derived(ragChatManager.isResponding(assetId));
  let transcript = $derived(transcriptManager.transcript);

  $effect(() => {
    if (transcript) {
      ragChatManager.ensureEngine(assetId, transcript.segments);
    }
  });

  $effect(() => {
    if (listElement && messages.length > 0) {
      listElement.scrollIntoView({ block: 'end' });
    }
  });

  const submit = () => {
    const question = input.trim();
    if (question.length === 0 || responding) {
      return;
    }
    void ragChatManager.ask(assetId, question);
    input = '';
  };

  const isActive = (start: number, end: number) => start <= currentTime && currentTime < end;
</script>

<div class="flex flex-col gap-2" data-testid="rag-chat">
  {#if messages.length === 0}
    <p class="text-sm text-immich-gray" data-testid="rag-chat-empty">{$t('rag_chat_empty')}</p>
  {/if}

  {#if messages.length > 0}
    <div class="flex flex-col gap-2" role="log" aria-live="polite" data-testid="rag-chat-list" bind:this={listElement}>
      {#each messages as message (message.id)}
        <div class="flex flex-col gap-1" data-testid="rag-chat-message" data-role={message.role}>
          <span class="text-xs font-semibold text-immich-gray">
            {message.role === 'user' ? $t('rag_chat_you') : $t('rag_chat_assistant')}
          </span>
          <p class="text-sm whitespace-pre-wrap">{message.content}</p>
          {#if message.citations && message.citations.length > 0}
            <div class="flex flex-wrap items-center gap-1" data-testid="rag-chat-sources">
              <span class="text-xs text-immich-gray">{$t('rag_chat_sources')}</span>
              {#each message.citations as citation, index (index)}
                <button
                  type="button"
                  class="rounded-sm bg-immich-gray/20 px-2 py-0.5 text-xs hover:bg-immich-primary/20"
                  data-testid="rag-chat-citation"
                  data-active={isActive(citation.timestampStart, citation.timestampEnd) ? 'true' : undefined}
                  title={citation.textSnippet}
                  onclick={() => onSeek(citation.timestampStart)}
                >
                  [{formatTimestamp(citation.timestampStart)}]
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if responding}
    <p class="text-sm text-immich-gray" data-testid="rag-chat-thinking">{$t('rag_chat_thinking')}</p>
  {/if}

  <div class="flex items-center gap-2">
    <input
      class="flex-1 rounded-sm border border-immich-gray/30 bg-immich-bg px-2 py-1 text-sm"
      data-testid="rag-chat-input"
      type="text"
      maxlength={500}
      disabled={responding}
      bind:value={input}
      onkeydown={(event) => {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        submit();
      }}
      aria-label={$t('rag_chat_input_label')}
      placeholder={$t('rag_chat_placeholder')}
    />
    <button
      type="button"
      class="rounded-sm bg-immich-primary px-3 py-1 text-sm text-white disabled:opacity-50"
      data-testid="rag-chat-send"
      disabled={responding || input.trim().length === 0}
      onclick={submit}
    >
      {$t('rag_chat_send')}
    </button>
  </div>
</div>
