export const illustrations = [
  { value: 'gift', label: 'Presente' },
  { value: 'coffee', label: 'Café' },
  { value: 'takeout', label: 'Comidinha' },
  { value: 'envelope', label: 'Cartinha' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'dinner', label: 'Jantar' },
  { value: 'picnic', label: 'Piquenique' },
  { value: 'stars', label: 'Lua e estrelas' },
  { value: 'games', label: 'Jogos' },
  { value: 'music', label: 'Música' },
  { value: 'relax', label: 'Relaxamento' },
  { value: 'flowers', label: 'Flores' },
  { value: 'book', label: 'Livro' },
  { value: 'dessert', label: 'Docinho' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'art', label: 'Arte' },
  { value: 'puzzle', label: 'Quebra-cabeça' },
  { value: 'camera', label: 'Câmera' },
  { value: 'map', label: 'Passeio' },
  { value: 'beauty', label: 'Beleza' },
  { value: 'cozy', label: 'Aconchego' },
  { value: 'car', label: 'Transporte' },
  { value: 'jar', label: 'Potinho de amor' },
  { value: 'clock', label: 'Tempo e memórias' },
] as const;

export type Illustration = typeof illustrations[number]['value'];

export function isIllustration(value: unknown): value is Illustration {
  return typeof value === 'string' && illustrations.some(option => option.value === value);
}
