<template>
  <div class="text-lg max-w-prose">
    <Title>What is this?</Title>
    <p>
      Tea is a hard thing to understand. You think you know it and then you
      don't. The <Logo :intensity="1" class="mx-1" /> project started as a way
      for
      <g-link class="link uniform-transition" to="/drinker/tony/">me</g-link>
      to document my experiences as I begun to learn the wild world of puer and
      other specialty teas.
    </p>
    <p>I created this for a handful of reasons:</p>
    <ol class="-mt-3">
      <li>
        The English-speaking world of specialty tea has disjoint information,
        therefore making it difficult to piece together and understand the
        effects of things like terroir without buying thousands of dollars of
        tea.
      </li>
      <li>
        To automatically sort teas by my preference without having to think
        about what my favorites are. And furthermore, to discover trends in the
        data to form meaningful relationships between different metrics of a tea
        and the subsequent experience of drinking it.
      </li>
      <li>I'm bad at keeping a handwritten journal.</li>
      <li>This justifies buying and trying more tea than I should.</li>
    </ol>
    <p>
      From there, it's evolved into an open source project that I've made freely
      available to the world. I encourage you to suggest new features or report
      bugs on the
      <a href="https://github.com/tonyketcham/puerh.wtf/">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke-width="2"
          class="z-10 inline-block w-5 h-5 m-1 my-auto"
          id="GithubFill"
        >
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
          />
        </svg>
        <span class="link uniform-transition">project's repository.</span>
      </a>
    </p>
  </div>
</template>

<script>
  import Title from '@/components/utility/layout/Title.vue';
  import Logo from '@/components/brand/Logo.vue';

  export default {
    components: {
      Title,
      Logo,
    },
    metaInfo: {
      title: 'About',
      meta: [
        {
          property: 'og:image',
          content:
            'https://og-image-navy.vercel.app/A%20tea%20log.jpeg?theme=dark&md=1&fontSize=150px&images=https%3A%2F%2Fpuerh.wtf%2Fassets%2Fstatic%2Fapple-touch-icon.7b22250.d6c38f098e4cfe7492d30929042211dd.png',
          vmid: 'og:image',
        },
      ],
    },
  };
</script>

<style lang="scss" scoped>
  p {
    @apply p-1 m-1;
  }
  ol {
    @apply p-5 space-y-3;
    li {
      @apply list-decimal list-outside px-2;
    }
    li::marker {
      @apply text-yellow-600 dark:text-yellow-300 text-xl;
    }
  }
</style>
