type DetailPanelProps = {
  title: string;
};

export function DetailPanel({ title }: DetailPanelProps): JSX.Element {
  return <aside>{title}</aside>;
}
