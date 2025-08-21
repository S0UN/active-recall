/**
 * VectorMathOperations - Pure mathematical functions for vector operations
 * 
 * This utility class contains all vector-related mathematical operations
 * extracted from the SmartRouter. All methods are pure functions with no
 * side effects, making them easy to test and reason about.
 * 
 * Following the Single Level of Abstraction Principle, this class handles
 * only the lowest level mathematical operations.
 */

export class VectorMathOperations {
  /**
   * Calculate cosine similarity between two vectors
   * 
   * @param vectorA First vector
   * @param vectorB Second vector
   * @returns Similarity score between 0 and 1
   */
  static calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimension');
    }

    const dotProduct = this.calculateDotProduct(vectorA, vectorB);
    const magnitudeA = this.calculateMagnitude(vectorA);
    const magnitudeB = this.calculateMagnitude(vectorB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Compute the centroid (mean) of multiple vectors
   * 
   * @param vectors Array of vectors to average
   * @returns Centroid vector
   */
  static computeCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      throw new Error('Cannot compute centroid of empty vector set');
    }

    const dimension = vectors[0].length;
    const centroid = new Array(dimension).fill(0);

    for (const vector of vectors) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += vector[i];
      }
    }

    return centroid.map(value => value / vectors.length);
  }

  /**
   * Normalize a vector to unit length
   * 
   * @param vector Vector to normalize
   * @returns Normalized vector
   */
  static normalizeVector(vector: number[]): number[] {
    const magnitude = this.calculateMagnitude(vector);
    
    if (magnitude === 0) {
      return vector;
    }

    return vector.map(value => value / magnitude);
  }

  /**
   * Calculate the average similarity from a set of similarity scores
   * 
   * @param similarities Array of similarity scores
   * @returns Average similarity
   */
  static calculateAverageSimilarity(similarities: number[]): number {
    if (similarities.length === 0) {
      return 0;
    }

    const sum = similarities.reduce((acc, sim) => acc + sim, 0);
    return sum / similarities.length;
  }

  /**
   * Calculate coherence score for a cluster of vectors
   * 
   * @param vectors Vectors in the cluster
   * @returns Coherence score between 0 and 1
   */
  static calculateClusterCoherence(vectors: number[][]): number {
    if (vectors.length < 2) {
      return 1; // Single vector or empty cluster is perfectly coherent
    }

    const centroid = this.computeCentroid(vectors);
    const similarities = vectors.map(vector => 
      this.calculateCosineSimilarity(vector, centroid)
    );

    return this.calculateAverageSimilarity(similarities);
  }

  /**
   * Find the maximum value in an array
   * 
   * @param values Array of numbers
   * @returns Maximum value
   */
  static findMaximum(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return Math.max(...values);
  }

  /**
   * Calculate dot product of two vectors
   */
  private static calculateDotProduct(vectorA: number[], vectorB: number[]): number {
    let product = 0;
    for (let i = 0; i < vectorA.length; i++) {
      product += vectorA[i] * vectorB[i];
    }
    return product;
  }

  /**
   * Calculate magnitude (length) of a vector
   */
  private static calculateMagnitude(vector: number[]): number {
    let sumSquares = 0;
    for (const value of vector) {
      sumSquares += value * value;
    }
    return Math.sqrt(sumSquares);
  }
}