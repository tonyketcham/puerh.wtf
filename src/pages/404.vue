<template>
  <Layout layout="2 columns">
    <template slot="primary-block">
      <div class="m-auto space-y-4 lg:space-y-8">
        <h1 class="text-5xl font-black lg:text-6xl">Oh shit, you're lost!</h1>
        <div class="text-center lg:text-left">
          <span
            class="
              text-[9.75rem]
              xl:text-[14rem]
              text-black
              border-4 border-black
              p-1
              rounded-md
            "
            >404</span
          >
        </div>
      </div>
      <div class="mt-2 text-lg md:mt-4 max-w-prose">
        <p>
          I'm so sorry someone pointed you here, especially if it was me and I
          broke a route. If you clicked a link that took you to this page, I'd
          really appreciate if you
          <a
            class="link"
            href="https://github.com/tonyketcham/puerh.wtf/issues/new"
            >submitted an issue</a
          >
          containing the page you came from and which link is broken on it!
        </p>
      </div>
    </template>
    <template slot="secondary-block"
      ><svg
        class="hidden w-64 h-64 lg:block lg:float-right"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="Gradient1">
            <stop offset="5%" stop-color="white" />
            <stop offset="95%" stop-color="blue" />
          </linearGradient>
          <linearGradient id="Gradient2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stop-color="red" />
            <stop offset="95%" stop-color="orange" />
          </linearGradient>

          <pattern id="Pattern" x="0" y="0" width=".25" height=".25">
            <rect x="0" y="0" width="50" height="50" fill="skyblue" />
            <rect x="0" y="0" width="25" height="25" fill="url(#Gradient2)" />
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="url(#Gradient1)"
              fill-opacity="0.5"
            />
          </pattern>
        </defs>

        <rect fill="url(#Pattern)" class="w-full h-full" /></svg
    ></template>
  </Layout>
</template>

<script>
  import Title from '@/components/utility/layout/Title.vue';

  export default {
    components: {
      Title,
    },
    metaInfo: {
      title: 'Unfound Puer [404] (Bass Boosted)',
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
