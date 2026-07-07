import type { DictResult } from '@/selection/dict-result';

export function DictCard({ result }: { result: DictResult }) {
  return (
    <div className="llmt-dict">
      <div className="llmt-dict__head">
        <span className="llmt-dict__word">{result.word}</span>
        {result.phonetic && <span className="llmt-dict__ipa">{result.phonetic}</span>}
      </div>
      <ul className="llmt-dict__senses">
        {result.senses.map((sense) => (
          <li key={`${sense.pos ?? ''}:${sense.meaning}`}>
            {sense.pos && <span className="llmt-dict__pos">{sense.pos}</span>}
            <span>{sense.meaning}</span>
          </li>
        ))}
      </ul>
      {result.examples && result.examples.length > 0 && (
        <ul className="llmt-dict__examples">
          {result.examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
