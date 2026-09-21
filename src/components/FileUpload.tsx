import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

interface Props { onFile: (file: File) => void; loading: boolean }

export function FileUpload({ onFile, loading }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const pick = (files: FileList | null) => { if (files?.[0]) onFile(files[0]); };
  return (
    <button type="button" className={`upload-zone ${dragging ? "is-dragging" : ""}`} onClick={() => input.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }} disabled={loading}>
      <input ref={input} type="file" accept=".stl,.obj,.3mf,.ply" hidden onChange={(event) => pick(event.target.files)} />
      <span className="upload-icon"><FileUp size={18} strokeWidth={1.7} /></span>
      <strong>{loading ? "Modell wird geprüft..." : "3D-Modell öffnen"}</strong>
      <span>STL, OBJ, 3MF oder PLY · lokal verarbeitet</span>
    </button>
  );
}