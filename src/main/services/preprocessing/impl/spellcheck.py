#!/usr/bin/env python3
import sys
import os
import re
from symspellpy import SymSpell, Verbosity

class SpellChecker:
    def __init__(self):
        self.sym_spell = self._create_spell_checker()
    
    def _create_spell_checker(self):
        sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
        dictionary_path = self._get_dictionary_path()
        
        if not os.path.exists(dictionary_path):
            self._download_dictionary(dictionary_path)
        
        if os.path.exists(dictionary_path):
            sym_spell.load_dictionary(dictionary_path, term_index=0, count_index=1)
            return sym_spell
        return None
    
    def _get_dictionary_path(self):
        return os.path.join(os.path.dirname(__file__), "frequency_dictionary_en_82_765.txt")
    
    def _download_dictionary(self, dictionary_path):
        import urllib.request
        url = "https://raw.githubusercontent.com/mammothb/symspellpy/master/symspellpy/frequency_dictionary_en_82_765.txt"
        try:
            print(f"Downloading dictionary to {dictionary_path}...", file=sys.stderr)
            urllib.request.urlretrieve(url, dictionary_path)
        except Exception as e:
            print(f"Failed to download dictionary: {e}", file=sys.stderr)
    
    def correct_text(self, text):
        if not self.sym_spell:
            return text
        
        tokens = self._tokenize(text)
        corrected_tokens = [self._correct_token(token) for token in tokens]
        return ''.join(corrected_tokens)
    
    def _tokenize(self, text):
        return re.findall(r'(\S+|\s+)', text)
    
    def _correct_token(self, token):
        if token.isspace():
            return token
        
        word, trailing_punctuation = self._extract_word(token)
        
        if self._should_skip_correction(word):
            return token
        
        corrected_word = self._apply_correction(word)
        return corrected_word + trailing_punctuation
    
    def _extract_word(self, token):
        word = token.strip('.,!?;:"\'()[]{}|<>/*-+=@#$%^&~`')
        trailing = token[len(word):]
        return word, trailing
    
    def _should_skip_correction(self, word):
        if not word:
            return True
        
        return (self._is_url(word) or
                self._is_file_path(word) or
                self._is_acronym(word) or
                self._is_camel_case(word) or
                self._has_underscores(word) or
                self._is_code_pattern(word))
    
    def _is_url(self, word):
        return word.startswith(('http://', 'https://', 'www.'))
    
    def _is_file_path(self, word):
        return '/' in word or '\\' in word or word.startswith('.')
    
    def _is_acronym(self, word):
        return bool(re.search(r'[A-Z]{2,}', word))
    
    def _is_camel_case(self, word):
        return len(word) > 1 and any(c.isupper() for c in word[1:])
    
    def _has_underscores(self, word):
        return '_' in word
    
    def _is_code_pattern(self, word):
        return bool(re.match(r'^(#[0-9a-fA-F]+|0x[0-9a-fA-F]+|\d+)$', word))
    
    def _apply_correction(self, word):
        if self._word_exists_in_dictionary(word):
            return word
        
        suggestions = self._get_suggestions(word)
        
        if not suggestions:
            return word
        
        if self._is_minor_typo(word, suggestions[0]):
            return word
        
        return self._preserve_case(word, suggestions[0].term)
    
    def _word_exists_in_dictionary(self, word):
        lookup = self.sym_spell.lookup(word.lower(), Verbosity.TOP, max_edit_distance=0)
        return lookup and lookup[0].count > 1000
    
    def _get_suggestions(self, word):
        return self.sym_spell.lookup(word.lower(), Verbosity.CLOSEST, max_edit_distance=2)
    
    def _is_minor_typo(self, original, suggestion):
        if suggestion.distance == 1 and len(original) >= 4:
            return set(original.lower()) != set(suggestion.term)
        return False
    
    def _preserve_case(self, original, corrected):
        if original.isupper():
            return corrected.upper()
        elif original[0].isupper():
            return corrected.capitalize()
        return corrected

def main():
    text = sys.stdin.read()
    checker = SpellChecker()
    corrected = checker.correct_text(text)
    print(corrected)

if __name__ == "__main__":
    main()