<template>
  <div class="flex space-x-2 align-middle">
    <g-image
      :src="image"
      blur="40"
      width="50"
      height="50"
      alt="Author"
      class="rounded-full w-9 h-9"
    />
    <h2 class="m-auto">{{ name }}</h2>
  </div>
</template>

<script>
  export default {
    props: {
      name: {
        type: String,
        default: 'Author Name',
      },
      image: {
        type: String,
        default: '#',
      },
    },
  };
</script>
