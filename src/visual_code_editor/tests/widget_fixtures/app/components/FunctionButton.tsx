type SaveButtonProps = {
  label: string;
};

export function SaveButton({ label }: SaveButtonProps): JSX.Element {
  return <button>{label}</button>;
}
