import type {
  BoolParam,
  ChoiceParam,
  ColorParam,
  FontParam,
  ImageParam,
  NumberParam,
  TextParam,
} from './types';

type Omitted<T> = Omit<T, 'id' | 'label' | 'type'>;

export const num = (id: string, label: string, o: Omitted<NumberParam>): NumberParam => ({
  id,
  label,
  type: 'number',
  ...o,
});

export const int = (
  id: string,
  label: string,
  o: Omit<Omitted<NumberParam>, 'step' | 'integer'>,
): NumberParam => ({ id, label, type: 'number', step: 1, integer: true, ...o });

export const bool = (id: string, label: string, o: Omitted<BoolParam>): BoolParam => ({
  id,
  label,
  type: 'bool',
  ...o,
});

export const text = (id: string, label: string, o: Omitted<TextParam>): TextParam => ({
  id,
  label,
  type: 'text',
  ...o,
});

export const choice = (id: string, label: string, o: Omitted<ChoiceParam>): ChoiceParam => ({
  id,
  label,
  type: 'choice',
  ...o,
});

export const font = (id: string, label: string, o: Omitted<FontParam>): FontParam => ({
  id,
  label,
  type: 'font',
  ...o,
});

export const image = (id: string, label: string, o: Omitted<ImageParam>): ImageParam => ({
  id,
  label,
  type: 'image',
  ...o,
});

export const color = (id: string, label: string, o: Omitted<ColorParam>): ColorParam => ({
  id,
  label,
  type: 'color',
  ...o,
});
