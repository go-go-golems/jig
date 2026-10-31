# Meter

A progress bar: a hair box 8px high with an ink fill from the left; accent when what it measures is bad.

## Use

`.meter` shows how far a long job has gone (an experiment's runs: `.meter.expmeter` 120px wide; clip scoring and recording: 160px), always beside a Stop button. `.meter.bad i` fills in accent. Inside a table cell it is 6px high.

## Markup

```html
<span class="meter expmeter"><i style="width: 40%"></i></span><button class="btn sm">Stop</button>
```

## Do and don't

- Do update it from the job's own progress callback; never animate a fake one.
