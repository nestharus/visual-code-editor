type ConfirmModalProps = {
  open: boolean;
};

export default function ConfirmModal({ open }: ConfirmModalProps) {
  return <div>{open ? "open" : "closed"}</div>;
}
