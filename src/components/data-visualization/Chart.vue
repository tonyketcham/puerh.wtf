<template>
  <canvas ref="chart" width="400" height="400" />
</template>
<script>
  import { Chart, registerables } from 'chart.js';
  export default {
    props: {
      chartType: {
        type: String,
        default: 'radar',
      },
      labels: {
        type: Array,
        default() {
          return [
            'Vegetal',
            'Floral',
            'Fruits',
            'Spices',
            'Earth',
            'Wood',
            'Nuts/Roast',
            'Cream',
            'Stone',
            'Umami',
          ];
        },
      },
      datasets: {
        // validator(value) {
        //   if (!(value instanceof Array)) {
        //     return false;
        //   }
        //   for (let set in value) {
        //     if (!(set instanceof Object)) {
        //       return false;
        //     }
        //   }
        //   return true;
        // },
        default() {
          return [
            {
              label: 'Start',
              fill: true,
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              borderColor: 'rgb(255, 99, 132)',
              pointBackgroundColor: 'rgb(255, 99, 132)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgb(255, 99, 132)',
              data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
            },
            {
              label: 'Finish',
              fill: true,
              backgroundColor: 'rgba(54, 162, 235, 0.2)',
              borderColor: 'rgb(54, 162, 235)',
              pointBackgroundColor: 'rgb(54, 162, 235)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgb(54, 162, 235)',
              data: [4, 6, 1, 1, 2, 6, 3, 9, 6, 2],
            },
          ];
        },
      },
      options: {
        type: Object,
        default() {
          return {
            scales: {
              r: {
                angleLines: {
                  display: true,
                },
                ticks: {
                  display: false,
                },
              },
            },
            elements: {
              line: {
                borderWidth: 3,
                tension: 0.2,
              },
            },
          };
        },
      },
    },
    data() {
      return {
        chart: null,
      };
    },
    computed: {
      chartData() {
        return {
          labels: this.labels,
          datasets: this.datasets,
        };
      },
      config() {
        return {
          type: this.chartType,
          data: this.chartData,
          options: this.options,
        };
      },
    },
    mounted() {
      Chart.register(...registerables);
      this.chart = new Chart(this.$refs.chart, this.config);
    },
  };
</script>
